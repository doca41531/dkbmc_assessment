/**
 * @description       : Assessment Sheet 배포 컨트롤러 - 중복 방지 및 Target 할당 로직 포함
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-21
 * @last modified by  : mingyu.park@dkbmc.com
**/
public with sharing class DKEDU_DeployAssessmentController {
    
    @AuraEnabled
    public static String createAssessmentSheet(String assessmentMasterId) {
        try {
            System.debug('Received assessmentMasterId: ' + assessmentMasterId);
            
            if (String.isBlank(assessmentMasterId)) {
                throw new AuraHandledException('Assessment Master ID가 전달되지 않았습니다.');
            }
            
            // Assessment Master 조회
            List<AssessmentMaster__c> masters = [
                SELECT Id, Name, AssessmentTemplateId__c
                FROM AssessmentMaster__c 
                WHERE Id = :assessmentMasterId
                LIMIT 1
            ];
            
            if (masters.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Master를 찾을 수 없습니다: ' + assessmentMasterId);
            }
            
            AssessmentMaster__c master = masters[0];
            System.debug('Found master: ' + master);
            
            if (master.AssessmentTemplateId__c == null) {
                throw new AuraHandledException('Assessment Template이 설정되지 않았습니다.');
            }
            
            // Assessment Master에 연결된 Assessment Target들 조회
            List<AssessmentTarget__c> targets = [
                SELECT Id, Name, ContactId__c
                FROM AssessmentTarget__c
                WHERE AssessmentMaster__c = :assessmentMasterId
            ];
            
            System.debug('Found targets count: ' + targets.size());
            for (AssessmentTarget__c target : targets) {
                System.debug('Target ID: ' + target.Id + ', Name: ' + target.Name + ', ContactId: ' + target.ContactId__c);
                System.debug('Target ID starts with: ' + String.valueOf(target.Id).left(3));
            }
            
            if (targets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Master에 연결된 Target이 없습니다.');
            }
            
            List<String> createdSheetIds = new List<String>();
            List<String> skippedTargets = new List<String>();
            
            // 각 Target에 대해 시험지 생성
            for (AssessmentTarget__c target : targets) {
                System.debug('Processing target: ' + target.Id + ' (' + target.Name + ')');
                
                // Target ID 유효성 체크
                if (target.Id == null) {
                    skippedTargets.add(target.Name + ' (Target ID가 null)');
                    continue;
                }
                
                // 중복 시험지 체크
                List<AssessmentSheet__c> existingSheets = [
                    SELECT Id, Status__c, AssessmentTargetId__c
                    FROM AssessmentSheet__c
                    WHERE AssessmentMasterId__c = :assessmentMasterId
                    AND AssessmentTargetId__c = :target.Id
                    LIMIT 1
                ];
                
                if (!existingSheets.isEmpty()) {
                    skippedTargets.add(target.Name + ' (이미 존재: ' + existingSheets[0].Id + ')');
                    System.debug('Skipping target ' + target.Id + ' - sheet already exists');
                    continue;
                }
                
                // Assessment Sheet 생성
                AssessmentSheet__c sheet = new AssessmentSheet__c();
                sheet.AssessmentMasterId__c = assessmentMasterId;
                sheet.AssessmentTemplateId__c = master.AssessmentTemplateId__c;
                sheet.AssessmentTargetId__c = target.Id;  // Assessment Target ID 직접 할당
                sheet.Status__c = 'Waiting';
                
                System.debug('About to insert sheet with:');
                System.debug('- AssessmentMasterId__c: ' + sheet.AssessmentMasterId__c);
                System.debug('- AssessmentTemplateId__c: ' + sheet.AssessmentTemplateId__c);
                System.debug('- AssessmentTargetId__c: ' + sheet.AssessmentTargetId__c);
                System.debug('- AssessmentTargetId__c type: ' + sheet.AssessmentTargetId__c?.getSObjectType());
                
                try {
                    insert sheet;
                    System.debug('SUCCESS: Created AssessmentSheet: ' + sheet.Id + ' for Target: ' + target.Name);
                    
                    // Section과 Item 생성
                    createSheetSectionsAndItems(sheet.Id, master.AssessmentTemplateId__c);
                    
                    createdSheetIds.add(sheet.Id);
                    
                } catch (Exception insertEx) {
                    System.debug('ERROR inserting sheet for target ' + target.Id + ': ' + insertEx.getMessage());
                    skippedTargets.add(target.Name + ' (생성 실패: ' + insertEx.getMessage() + ')');
                }
            }
            
            // 결과 메시지 구성
            String resultMessage = '';
            if (!createdSheetIds.isEmpty()) {
                resultMessage += '생성된 시험지: ' + createdSheetIds.size() + '개';
            }
            if (!skippedTargets.isEmpty()) {
                resultMessage += (String.isNotBlank(resultMessage) ? ', ' : '') + '건너뛴 Target: ' + skippedTargets.size() + '개';
            }
            
            return resultMessage;
            
        } catch (Exception e) {
            System.debug('Error details: ' + e.getMessage());
            System.debug('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('오류: ' + e.getMessage());
        }
    }
    
    private static void createSheetSectionsAndItems(String sheetId, String templateId) {
        try {
            // Template Section 조회
            List<AssessmentTemplateSection__c> templateSections = [
                SELECT Id, Name, SequenceOrder__c
                FROM AssessmentTemplateSection__c
                WHERE AssessmentTemplate__c = :templateId
                ORDER BY SequenceOrder__c
            ];
            
            if (templateSections.isEmpty()) {
                System.debug('No template sections found for template: ' + templateId);
                return;
            }
            
            List<AssessmentSheetSection__c> sheetSections = new List<AssessmentSheetSection__c>();
            
            for (AssessmentTemplateSection__c tempSection : templateSections) {
                AssessmentSheetSection__c sheetSection = new AssessmentSheetSection__c();
                sheetSection.AssessmentResultHeader__c = sheetId;
                sheetSection.AssessmentTemplateGroup__c = tempSection.Id;
                sheetSection.SequenceOrder__c = tempSection.SequenceOrder__c;
                sheetSection.Status__c = 'Waiting';
                sheetSections.add(sheetSection);
            }
            
            insert sheetSections;
            System.debug('Created ' + sheetSections.size() + ' sheet sections');
            
            // Section별 Item 생성
            createSheetItems(sheetSections);
            
        } catch (Exception e) {
            System.debug('Error in createSheetSectionsAndItems: ' + e.getMessage());
            throw e;
        }
    }
    
    private static void createSheetItems(List<AssessmentSheetSection__c> sheetSections) {
        try {
            List<AssessmentSheetItem__c> sheetItems = new List<AssessmentSheetItem__c>();
            
            Set<Id> templateSectionIds = new Set<Id>();
            for (AssessmentSheetSection__c section : sheetSections) {
                templateSectionIds.add(section.AssessmentTemplateGroup__c);
            }
            
            // Template Question 조회
            List<AssessmentTemplateQuestion__c> templateQuestions = [
                SELECT Id, AssessmentTemplateGroup__c, Order__c, Score__c
                FROM AssessmentTemplateQuestion__c
                WHERE AssessmentTemplateGroup__c IN :templateSectionIds
                ORDER BY AssessmentTemplateGroup__c, Order__c
            ];
            
            if (templateQuestions.isEmpty()) {
                System.debug('No template questions found for sections');
                return;
            }
            
            // Template Section ID → Sheet Section ID 매핑
            Map<Id, Id> templateToSheetSectionMap = new Map<Id, Id>();
            for (AssessmentSheetSection__c section : sheetSections) {
                templateToSheetSectionMap.put(section.AssessmentTemplateGroup__c, section.Id);
            }
            
            for (AssessmentTemplateQuestion__c tempQuestion : templateQuestions) {
                Id sheetSectionId = templateToSheetSectionMap.get(tempQuestion.AssessmentTemplateGroup__c);
                if (sheetSectionId != null) {
                    AssessmentSheetItem__c sheetItem = new AssessmentSheetItem__c();
                    sheetItem.AssessmentResultSection__c = sheetSectionId;
                    sheetItem.AssessmentTemplateQuestion__c = tempQuestion.Id;
                    sheetItem.Score__c = tempQuestion.Score__c;
                    sheetItems.add(sheetItem);
                }
            }
            
            if (!sheetItems.isEmpty()) {
                insert sheetItems;
                System.debug('Created ' + sheetItems.size() + ' sheet items');
            }
            
        } catch (Exception e) {
            System.debug('Error in createSheetItems: ' + e.getMessage());
            throw e;
        }
    }
}