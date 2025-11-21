/**
 * @description Assessment Page Controller with correct navigation logic
 * @author mingyu.park@dkbmc.com
 * @last modified on 2025-11-20
 */
public with sharing class DKEDU_AssessmentPageController {
    
    
    // ⭐ Assessment 접근 권한 확인 (가장 기본적인 체크)
    @AuraEnabled
    public static Boolean checkAssessmentAccess(String sheetId) {
        try {
            // Assessment 기본 접근 권한 확인
            if (!checkUserHasAssessmentPermission()) {
                return false;
            }
            
            return true;
            
        } catch (Exception e) {
            System.debug('Assessment access check error: ' + e.getMessage());
            return false;
        }
    }
    
    // ⭐ Assessment Sheet 상태와 사용자 권한 확인
    @AuraEnabled
    public static Map<String, Object> getAssessmentStatusAndUserPermissions(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // ⭐ Assessment 접근 권한 먼저 확인
            if (!checkUserHasAssessmentPermission()) {
                throw new AuraHandledException('Assessment 접근 권한이 없습니다. 관리자에게 문의하세요.');
            }
            
            // Assessment Sheet 조회
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c, CreatedById
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            
            // 사용자 권한 확인
            Boolean isAdmin = checkUserIsAdmin();
            Boolean canEdit = checkUserCanEditByProfile();
            Boolean canGrade = checkUserCanGrade();
            Boolean isCreator = (sheet.CreatedById == UserInfo.getUserId());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('status', sheet.Status__c);
            result.put('isAdmin', isAdmin);
            result.put('canEdit', canEdit);
            result.put('canGrade', canGrade);
            result.put('isCreator', isCreator);
            result.put('createdById', sheet.CreatedById);
            
            return result;
            
        } catch (Exception e) {
            throw new AuraHandledException('상태 확인 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    // ⭐ Assessment Sheet 초기화 (관리자만)
    @AuraEnabled
    public static String resetAssessmentSheet(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // 관리자 권한 확인
            if (!checkUserIsAdmin()) {
                throw new AuraHandledException('관리자 권한이 필요합니다.');
            }
            
            // Assessment Sheet Items 삭제 (답변 초기화)
            List<AssessmentSheetItem__c> itemsToUpdate = [
                SELECT Id, Answer__c, Score__c
                FROM AssessmentSheetItem__c
                WHERE AssessmentResultSection__r.AssessmentResultHeader__c = :sheetId
            ];
            
            for (AssessmentSheetItem__c item : itemsToUpdate) {
                item.Answer__c = null;
                item.Score__c = null;
            }
            
            if (!itemsToUpdate.isEmpty()) {
                update itemsToUpdate;
            }
            
            // Assessment Sheet 상태를 Waiting으로 변경
            AssessmentSheet__c sheet = new AssessmentSheet__c(
                Id = sheetId,
                Status__c = 'Waiting'
            );
            update sheet;
            
            return '성공적으로 초기화되었습니다.';
            
        } catch (Exception e) {
            throw new AuraHandledException('초기화 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    // ⭐ Assessment 기본 접근 권한 확인 (Permission Set 기반)
    private static Boolean checkUserHasAssessmentPermission() {
        try {
            String currentUserId = UserInfo.getUserId();
            
            // System Administrator는 항상 접근 가능
            if (checkUserIsSystemAdmin()) {
                return true;
            }
            
            // Assessment Permission Set 확인
            List<PermissionSetAssignment> assessmentPermissions = [
                SELECT Id, PermissionSet.Name 
                FROM PermissionSetAssignment 
                WHERE AssigneeId = :currentUserId 
                AND PermissionSet.Name = 'Assessment'
                AND IsActive = true
                LIMIT 1
            ];
            
            return !assessmentPermissions.isEmpty();
            
        } catch (Exception e) {
            System.debug('Assessment permission check error: ' + e.getMessage());
            return false;
        }
    }
    
    // ⭐ 채점 권한 확인
    private static Boolean checkUserCanGrade() {
        try {
            String currentUserId = UserInfo.getUserId();
            
            // System Administrator는 항상 채점 가능
            if (checkUserIsSystemAdmin()) {
                return true;
            }
            
            // Assessment Permission Set이 있으면 채점도 가능
            return checkUserHasAssessmentPermission();
            
        } catch (Exception e) {
            System.debug('Grading permission check error: ' + e.getMessage());
            return false;
        }
    }
    
    // ⭐ System Administrator 확인 (순수 시스템 관리자)
    private static Boolean checkUserIsSystemAdmin() {
        try {
            List<User> adminUsers = [
                SELECT Id, Profile.Name 
                FROM User 
                WHERE Id = :UserInfo.getUserId() 
                AND Profile.Name IN ('System Administrator', 'Systems Administrator')
                LIMIT 1
            ];
            
            return !adminUsers.isEmpty();
            
        } catch (Exception e) {
            System.debug('System admin check error: ' + e.getMessage());
            return false;
        }
    }
    
    // ⭐ 사용자가 관리자인지 확인 (System Admin 또는 Assessment Permission Set)
    private static Boolean checkUserIsAdmin() {
        try {
            // System Administrator는 항상 관리자
            if (checkUserIsSystemAdmin()) {
                return true;
            }
            
            // Assessment Permission Set이 있으면 관리자 권한도 부여
            return checkUserHasAssessmentPermission();
            
        } catch (Exception e) {
            System.debug('Admin check error: ' + e.getMessage());
            return false;
        }
    }
    
    // ⭐ 사용자가 Assessment를 편집할 수 있는지 확인
    private static Boolean checkUserCanEditByProfile() {
        try {
            // Assessment Permission Set이 있으면 편집 가능
            return checkUserHasAssessmentPermission();
            
        } catch (Exception e) {
            System.debug('Edit permission check error: ' + e.getMessage());
            return false;
        }
    }

    // ⭐ 점수 저장 (채점 모드 전용)
    @AuraEnabled
    public static String saveScore(String itemId, Decimal score) {
        try {
            if (String.isBlank(itemId)) {
                throw new AuraHandledException('Item ID가 전달되지 않았습니다.');
            }
            
            // Assessment 권한 확인
            if (!checkUserHasAssessmentPermission()) {
                throw new AuraHandledException('Assessment 접근 권한이 없습니다.');
            }
            
            // 채점 권한 확인 (관리자만 점수 부여 가능)
            if (!checkUserCanGrade()) {
                throw new AuraHandledException('채점 권한이 없습니다.');
            }
            
            // Assessment Sheet Item 업데이트
            AssessmentSheetItem__c item = new AssessmentSheetItem__c(
                Id = itemId,
                Score__c = score
            );
            
            update item;
            
            return '점수가 저장되었습니다.';
            
        } catch (Exception e) {
            throw new AuraHandledException('점수 저장 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    // ⭐ Assessment Sheet 상태만 확인하는 간단한 메서드
    @AuraEnabled
    public static String checkAssessmentStatus(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // ⭐ Assessment 접근 권한 먼저 확인
            if (!checkUserHasAssessmentPermission()) {
                throw new AuraHandledException('Assessment 접근 권한이 없습니다.');
            }
            
            // Assessment Sheet 상태만 조회
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            return sheets[0].Status__c;
            
        } catch (Exception e) {
            throw new AuraHandledException('상태 확인 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static Map<String, Object> getAssessmentData(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // ⭐ Assessment 접근 권한 먼저 확인
            if (!checkUserHasAssessmentPermission()) {
                throw new AuraHandledException('Assessment 접근 권한이 없습니다. 관리자에게 Permission Set 할당을 요청하세요.');
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
            
            // 선다형 질문들의 Template Question ID 수집
            Set<Id> choosableQuestionIds = new Set<Id>();
            for (AssessmentSheetItem__c item : items) {
                String questionType = item.AssessmentTemplateQuestion__r.Type__c;
                if (questionType == 'Choosable' || questionType == 'Multi Choosable') {
                    choosableQuestionIds.add(item.AssessmentTemplateQuestion__c);
                }
            }
            
            // 선다형 질문들의 옵션 조회
            Map<Id, List<Map<String, Object>>> optionsMap = new Map<Id, List<Map<String, Object>>>();
            if (!choosableQuestionIds.isEmpty()) {
                List<AssessmentTemplateQuestionItem__c> questionItems = [
                    SELECT AssessmentTemplateQuestion__c, Content__c, Order__c
                    FROM AssessmentTemplateQuestionItem__c
                    WHERE AssessmentTemplateQuestion__c IN :choosableQuestionIds
                    ORDER BY AssessmentTemplateQuestion__c, Order__c
                ];
                
                for (AssessmentTemplateQuestionItem__c item : questionItems) {
                    if (!optionsMap.containsKey(item.AssessmentTemplateQuestion__c)) {
                        optionsMap.put(item.AssessmentTemplateQuestion__c, new List<Map<String, Object>>());
                    }
                    
                    optionsMap.get(item.AssessmentTemplateQuestion__c).add(new Map<String, Object>{
                        'label' => item.Content__c,
                        'value' => item.Content__c
                    });
                }
            }
            
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
                        itemMap.put('Score__c', item.Score__c);          // ⭐ LWC에서 기대하는 키명
                        itemMap.put('Answer__c', item.Answer__c);        // ⭐ LWC에서 기대하는 키명
                        itemMap.put('score', item.Score__c);             // 기존 호환성 유지
                        itemMap.put('response', item.Answer__c);         // 기존 호환성 유지
                        itemMap.put('order', item.AssessmentTemplateQuestion__r.Order__c);
                        
                        // 선다형이면 옵션 추가
                        String questionType = item.AssessmentTemplateQuestion__r.Type__c;
                        if (questionType == 'Choosable' || questionType == 'Multi Choosable') {
                            List<Map<String, Object>> options = optionsMap.get(item.AssessmentTemplateQuestion__c);
                            itemMap.put('options', options != null ? options : new List<Map<String, Object>>());
                        }
                        
                        itemList.add(itemMap);
                    }
                }
                
                sectionMap.put('items', itemList);
                sectionList.add(sectionMap);
            }
            
            result.put('sections', sectionList);
            return result;
            
        } catch (Exception e) {
            System.debug('Error loading assessment data: ' + e.getMessage());
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
            
        } catch (Exception e) {
            System.debug('Error saving response: ' + e.getMessage());
            throw new AuraHandledException('응답 저장 실패: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static Map<String, Object> getAssessmentSheetInfo(String recordId) {
        try {
            if (String.isBlank(recordId)) {
                throw new AuraHandledException('Record ID가 전달되지 않았습니다.');
            }
            
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Name, Status__c, AssessmentMasterId__c, AssessmentTemplateId__c
                FROM AssessmentSheet__c
                WHERE Id = :recordId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            
            if (sheet.Status__c == 'Complete') {
                throw new AuraHandledException('이미 완료된 평가입니다. 결과 페이지를 확인해주세요.');
            }
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('Id', sheet.Id);
            result.put('Name', sheet.Name);
            result.put('Status', sheet.Status__c);
            return result;
            
        } catch (Exception e) {
            throw new AuraHandledException('Assessment Sheet 정보 조회 실패: ' + e.getMessage());
        }
    }

    // ⭐ 핵심 수정: 제출 후 이동할 Assessment Sheet ID를 반환
    @AuraEnabled
    public static Map<String, Object> submitAssessment(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            // 1. 현재 Assessment Sheet 완료 처리
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Status__c, AssessmentMasterId__c, AssessmentTargetId__c
                FROM AssessmentSheet__c 
                WHERE Id = :sheetId 
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c currentSheet = sheets[0];
            currentSheet.Status__c = 'Complete';
            update currentSheet;
            
            // 2. 관련 Section들도 완료 처리
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
            
            // 3. 이동할 대상 결정 로직
            Map<String, Object> result = new Map<String, Object>();
            
            // Option 1: 같은 AssessmentTarget의 최신 Assessment Sheet로 이동
            if (currentSheet.AssessmentTargetId__c != null) {
                List<AssessmentSheet__c> latestSheets = [
                    SELECT Id, Name, Status__c, CreatedDate
                    FROM AssessmentSheet__c
                    WHERE AssessmentTargetId__c = :currentSheet.AssessmentTargetId__c
                    AND Status__c IN ('Waiting', 'In Progress')
                    ORDER BY CreatedDate DESC
                    LIMIT 1
                ];
                
                if (!latestSheets.isEmpty()) {
                    result.put('navigationType', 'RECORD');
                    result.put('recordId', latestSheets[0].Id);
                    result.put('message', '다음 평가로 이동합니다.');
                    return result;
                }
            }
            
            // Option 2: Assessment Target 레코드로 이동 (Assessment Target이 있는 경우)
            if (currentSheet.AssessmentTargetId__c != null) {
                result.put('navigationType', 'RECORD');
                result.put('recordId', currentSheet.AssessmentTargetId__c);
                result.put('message', '평가 대상 페이지로 이동합니다.');
                return result;
            }
            
            // Option 3: Assessment Master 레코드로 이동
            if (currentSheet.AssessmentMasterId__c != null) {
                result.put('navigationType', 'RECORD');
                result.put('recordId', currentSheet.AssessmentMasterId__c);
                result.put('message', '평가 마스터 페이지로 이동합니다.');
                return result;
            }
            
            // Option 4: Assessment Sheet 목록 페이지로 이동 (기본값)
            result.put('navigationType', 'LIST');
            result.put('objectApiName', 'AssessmentSheet__c');
            result.put('message', '평가 목록으로 이동합니다.');
            return result;
            
        } catch (Exception e) {
            System.debug('Submit assessment error: ' + e.getMessage());
            throw new AuraHandledException('제출 실패: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Map<String, Object> getAssessmentResult(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }
            
            List<AssessmentSheet__c> sheets = [
                SELECT Id, Name, Status__c, AssessmentMasterId__c, AssessmentTemplateId__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];
            
            if (sheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }
            
            AssessmentSheet__c sheet = sheets[0];
            
            if (sheet.Status__c != 'Complete') {
                throw new AuraHandledException('아직 완료되지 않은 평가입니다.');
            }
            
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
            throw new AuraHandledException('결과 조회 실패: ' + e.getMessage());
        }
    }
    
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
            
            String status = sheets[0].Status__c;
            return status == 'Waiting' || status == 'In Progress';
            
        } catch (Exception e) {
            return false;
        }
    }
    
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
                update sheet;
            }
            
        } catch (Exception e) {
            throw new AuraHandledException('평가 시작 처리 실패: ' + e.getMessage());
        }
    }
    
    // ⭐ 추가: 표준 레코드 페이지 URL 생성 메서드
    @AuraEnabled
    public static String getRecordUrl(String recordId) {
        try {
            if (String.isBlank(recordId)) {
                throw new AuraHandledException('Record ID가 전달되지 않았습니다.');
            }
            
            // Lightning Experience URL 생성
            String lightningUrl = '/lightning/r/AssessmentSheet__c/' + recordId + '/view';
            return lightningUrl;
            
        } catch (Exception e) {
            throw new AuraHandledException('URL 생성 실패: ' + e.getMessage());
        }
    }
}