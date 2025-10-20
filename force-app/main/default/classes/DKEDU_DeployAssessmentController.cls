/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
public with sharing class DKEDU_DeployAssessmentController {
    
    @AuraEnabled
    public static String createAssessmentSheet(String assessmentMasterId) {
        try {
            // 파스칼케이스로 수정
            AssessmentMaster__c master = [
                SELECT Id, Name, AssessmentTemplateId__c
                FROM AssessmentMaster__c 
                WHERE Id = :assessmentMasterId
            ];
            
            AssessmentSheet__c sheet = new AssessmentSheet__c();
            sheet.AssessmentMasterId__c = assessmentMasterId;
            sheet.AssessmentTemplateId__c = master.AssessmentTemplateId__c;
            sheet.Status__c = 'Waiting';
            
            insert sheet;
            
            createSheetSectionsAndItems(sheet.Id, master.AssessmentTemplateId__c);
            
            return sheet.Id;
            
        } catch (Exception e) {
            throw new AuraHandledException('시험지 생성 실패: ' + e.getMessage());
        }
    }
    
    private static void createSheetSectionsAndItems(String sheetId, String templateId) {
        // 파스칼케이스로 수정
        List<AssessmentTemplateSection__c> templateSections = [
            SELECT Id, Name, SequenceOrder__c
            FROM AssessmentTemplateSection__c
            WHERE AssessmentTemplate__c = :templateId
            ORDER BY SequenceOrder__c
        ];
        
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
        
        createSheetItems(sheetSections);
    }
    
    private static void createSheetItems(List<AssessmentSheetSection__c> sheetSections) {
        List<AssessmentSheetItem__c> sheetItems = new List<AssessmentSheetItem__c>();
        
        Set<Id> templateSectionIds = new Set<Id>();
        for (AssessmentSheetSection__c section : sheetSections) {
            templateSectionIds.add(section.AssessmentTemplateGroup__c);
        }
        
        List<AssessmentTemplateQuestion__c> templateQuestions = [
            SELECT Id, AssessmentTemplateGroup__c, Order__c, Score__c
            FROM AssessmentTemplateQuestion__c
            WHERE AssessmentTemplateGroup__c IN :templateSectionIds
            ORDER BY Order__c
        ];
        
        Map<Id, Id> templateToSheetSectionMap = new Map<Id, Id>();
        for (AssessmentSheetSection__c section : sheetSections) {
            templateToSheetSectionMap.put(section.AssessmentTemplateGroup__c, section.Id);
        }
        
        for (AssessmentTemplateQuestion__c tempQuestion : templateQuestions) {
            AssessmentSheetItem__c sheetItem = new AssessmentSheetItem__c();
            sheetItem.AssessmentResultSection__c = templateToSheetSectionMap.get(tempQuestion.AssessmentTemplateGroup__c);
            sheetItem.AssessmentTemplateQuestion__c = tempQuestion.Id;
            sheetItem.Score__c = tempQuestion.Score__c;
            sheetItems.add(sheetItem);
        }
        
        insert sheetItems;
    }
}