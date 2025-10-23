/**
 * @description Assessment Page Controller for handling assessment data and responses
 * @author mingyu.park@dkbmc.com
 * @last modified on 2025-10-21
 */
public with sharing class DKEDU_AssessmentPageController {
    
    @AuraEnabled
    public static Map<String, Object> getAssessmentData(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // Assessment Sheet 조회
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Name, AssessmentMasterId__c, AssessmentTemplateId__c, Status__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            
            // Assessment Sheet Sections 조회
            List<AssessmentSheetSection__c> sections = [
                SELECT Id, AssessmentResultHeader__c, AssessmentTemplateGroup__c, 
                       SequenceOrder__c, Status__c,
                       AssessmentTemplateGroup__r.Name
                FROM AssessmentSheetSection__c
                WHERE AssessmentResultHeader__c = :sheetId
                ORDER BY SequenceOrder__c
            ];
            
            // Assessment Sheet Items 조회
            Set<Id> sectionIds = new Set<Id>();
            for (AssessmentSheetSection__c section : sections) {
                sectionIds.add(section.Id);
            }
            
            List<AssessmentSheetItem__c> items = [
                SELECT Id, AssessmentResultSection__c, AssessmentTemplateQuestion__c,
                       Score__c, Answer__c,
                       AssessmentTemplateQuestion__r.Question__c,
                       AssessmentTemplateQuestion__r.Type__c,
                       AssessmentTemplateQuestion__r.Order__c
                FROM AssessmentSheetItem__c
                WHERE AssessmentResultSection__c IN :sectionIds
                ORDER BY AssessmentTemplateQuestion__r.Order__c
            ];
            
            // 데이터 구조화
            Map<String, Object> result = new Map<String, Object>();
            result.put('sheet', sheet);
            
            List<Map<String, Object>> sectionList = new List<Map<String, Object>>();
            
            for (AssessmentSheetSection__c section : sections) {
                Map<String, Object> sectionMap = new Map<String, Object>();
                sectionMap.put('Id', section.Id);
                sectionMap.put('Name', section.AssessmentTemplateGroup__r.Name);
                sectionMap.put('SequenceOrder', section.SequenceOrder__c);
                
                List<Map<String, Object>> itemList = new List<Map<String, Object>>();
                
                for (AssessmentSheetItem__c item : items) {
                    if (item.AssessmentResultSection__c == section.Id) {
                        Map<String, Object> itemMap = new Map<String, Object>();
                        itemMap.put('Id', item.Id);
                        itemMap.put('questionContent', item.AssessmentTemplateQuestion__r.Question__c);
                        itemMap.put('questionType', item.AssessmentTemplateQuestion__r.Type__c);
                        itemMap.put('score', item.Score__c);
                        itemMap.put('response', item.Answer__c);
                        itemMap.put('order', item.AssessmentTemplateQuestion__r.Order__c);
                        itemList.add(itemMap);
                    }
                }
                
                sectionMap.put('items', itemList);
                sectionList.add(sectionMap);
            }
            
            result.put('sections', sectionList);
            
            System.debug('Assessment data loaded successfully for sheet: ' + sheetId);
            return result;
            
        } catch (Exception e) {
            System.debug('Error loading assessment data: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('데이터 조회 실패: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void saveResponse(String itemId, String answer) {
        try {
            if (String.isBlank(itemId)) {
                throw new AuraHandledException('Item ID가 전달되지 않았습니다.');
            }
            
            List<AssessmentSheetItem__c> items = [
                SELECT Id, Answer__c 
                FROM AssessmentSheetItem__c 
                WHERE Id = :itemId 
                LIMIT 1
            ];
            
            if (items.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Item을 찾을 수 없습니다.');
            }
            
            AssessmentSheetItem__c item = items[0];
            item.Answer__c = answer;
            
            update item;
            
            System.debug('Response saved successfully for item: ' + itemId);
            
        } catch (Exception e) {
            System.debug('Error saving response: ' + e.getMessage());
            throw new AuraHandledException('응답 저장 실패: ' + e.getMessage());
        }
    }
/**
 * Assessment Sheet 정보 조회 (Button용)
 */
@AuraEnabled
public static Map<String, Object> getAssessmentSheetInfo(String recordId) {
    try {
        System.debug('=== Button getAssessmentSheetInfo 시작 ===');
        System.debug('받은 recordId: ' + recordId);
        
        if (String.isBlank(recordId)) {
            throw new AuraHandledException('Record ID가 전달되지 않았습니다.');
        }
        
        // Assessment Sheet 조회
        List<AssessmentSheet__c> sheets = [
            SELECT Id, Name, Status__c, AssessmentMasterId__c, AssessmentTemplateId__c
            FROM AssessmentSheet__c
            WHERE Id = :recordId
            LIMIT 1
        ];
        
        System.debug('조회된 sheets 개수: ' + sheets.size());
        
        if (sheets.isEmpty()) {
            throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
        }
        
        AssessmentSheet__c sheet = sheets[0];
        System.debug('찾은 sheet: ' + sheet);
        
        // 상태 확인
        if (sheet.Status__c == 'Complete') {
            throw new AuraHandledException('이미 완료된 평가입니다. 결과 페이지를 확인해주세요.');
        }
        
        Map<String, Object> result = new Map<String, Object>();
        result.put('Id', sheet.Id);
        result.put('Name', sheet.Name);
        result.put('Status', sheet.Status__c);
        
        System.debug('반환할 result: ' + result);
        return result;
        
    } catch (Exception e) {
        System.debug('❌ Button Error: ' + e.getMessage());
        System.debug('Stack trace: ' + e.getStackTraceString());
        throw new AuraHandledException('Assessment Sheet 정보 조회 실패: ' + e.getMessage());
    }
}
    @AuraEnabled
    public static void submitAssessment(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c 
                FROM AssessmentSheet__c 
                WHERE Id = :sheetId 
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            sheet.Status__c = 'Complete';
            // SubmittedDate__c 필드가 없으므로 제거
            
            update sheet;
            
            // 모든 섹션 상태도 Complete로 변경
            List<AssessmentSheetSection__c> sections = [
                SELECT Id, Status__c
                FROM AssessmentSheetSection__c
                WHERE AssessmentResultHeader__c = :sheetId
            ];
            
            for (AssessmentSheetSection__c section : sections) {
                section.Status__c = 'Complete';
            }
            
            if (!sections.isEmpty()) {
                update sections;
            }
            
            System.debug('Assessment submitted successfully: ' + sheetId);
            
        } catch (Exception e) {
            System.debug('Error submitting assessment: ' + e.getMessage());
            throw new AuraHandledException('제출 실패: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Map<String, Object> getAssessmentResult(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // Assessment Sheet 조회
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Name, Status__c,
                       AssessmentMasterId__c, AssessmentTemplateId__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            
            // 완료되지 않은 평가는 접근 불가
            if (sheet.Status__c != 'Complete') {
                throw new AuraHandledException('아직 완료되지 않은 평가입니다.');
            }
            
            // 결과 데이터 조회 - 올바른 관계명 사용
            List<AssessmentSheetItem__c> allItems = [
                SELECT Id, Answer__c, Score__c, AssessmentResultSection__c,
                       AssessmentTemplateQuestion__r.Question__c,
                       AssessmentTemplateQuestion__r.Type__c,
                       AssessmentResultSection__r.AssessmentTemplateGroup__r.Name,
                       AssessmentResultSection__r.SequenceOrder__c
                FROM AssessmentSheetItem__c
                WHERE AssessmentResultSection__r.AssessmentResultHeader__c = :sheetId
                ORDER BY AssessmentResultSection__r.SequenceOrder__c,
                         AssessmentTemplateQuestion__r.Order__c
            ];
            
            // 섹션별로 그룹화
            Map<Id, List<AssessmentSheetItem__c>> sectionItemsMap = new Map<Id, List<AssessmentSheetItem__c>>();
            for (AssessmentSheetItem__c item : allItems) {
                Id sectionId = item.AssessmentResultSection__c;
                if (!sectionItemsMap.containsKey(sectionId)) {
                    sectionItemsMap.put(sectionId, new List<AssessmentSheetItem__c>());
                }
                sectionItemsMap.get(sectionId).add(item);
            }
            
            List<AssessmentSheetSection__c> sections = [
                SELECT Id, AssessmentTemplateGroup__r.Name, SequenceOrder__c
                FROM AssessmentSheetSection__c
                WHERE AssessmentResultHeader__c = :sheetId
                ORDER BY SequenceOrder__c
            ];
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('sheet', sheet);
            result.put('sections', sections);
            result.put('sectionItemsMap', sectionItemsMap);
            
            return result;
            
        } catch (Exception e) {
            System.debug('Error getting assessment result: ' + e.getMessage());
            throw new AuraHandledException('결과 조회 실패: ' + e.getMessage());
        }
    }
    
    // 유틸리티 메소드: 사용자의 평가 진행 상황 체크
    @AuraEnabled
    public static Boolean isAssessmentAccessible(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                return false;
            }
            
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                return false;
            }
            
            // Waiting 또는 In Progress 상태인 경우만 접근 가능
            String status = sheets[0].Status__c;
            return status == 'Waiting' || status == 'In Progress';
            
        } catch (Exception e) {
            System.debug('Error checking assessment accessibility: ' + e.getMessage());
            return false;
        }
    }
    
    // 유틸리티 메소드: 평가 시작 시 상태 업데이트
    @AuraEnabled
    public static void startAssessment(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId AND Status__c = 'Waiting'
                LIMIT 1
            ];
            
            if (!sheets.isEmpty()) {
                AssessmentSheet__c sheet = sheets[0];
                sheet.Status__c = 'In Progress';
                // StartedDate__c 필드가 없으므로 제거
                
                update sheet;
                
                System.debug('Assessment started: ' + sheetId);
            }
            
        } catch (Exception e) {
            System.debug('Error starting assessment: ' + e.getMessage());
            throw new AuraHandledException('평가 시작 처리 실패: ' + e.getMessage());
        }
    }
}