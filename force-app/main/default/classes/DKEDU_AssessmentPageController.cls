/**
 * @description Assessment Page Controller with correct navigation logic
 * @author mingyu.park@dkbmc.com
 * @last modified on 2025-11-21 - Added score validation logic
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

    // ⭐ 점수 저장 (채점 모드 전용) - 최대 점수 검증 로직 추가
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
            
            // ⭐ Assessment Sheet Item과 관련된 Assessment Template Question의 최대 점수 조회
            List<AssessmentSheetItem__c> items = [
                SELECT Id, Score__c, AssessmentTemplateQuestion__r.Score__c
                FROM AssessmentSheetItem__c 
                WHERE Id = :itemId
                LIMIT 1
            ];
            
            if (items.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Item을 찾을 수 없습니다.');
            }
            
            AssessmentSheetItem__c item = items[0];
            Decimal maxScore = item.AssessmentTemplateQuestion__r.Score__c;
            
            // ⭐ 점수 검증: 입력된 점수가 최대 점수를 초과하는지 확인
            if (score != null && maxScore != null && score > maxScore) {
                throw new AuraHandledException(
                    '입력된 점수(' + score + ')가 최대 점수(' + maxScore + ')를 초과할 수 없습니다.'
                );
            }
            
            // ⭐ 음수 점수 방지
            if (score != null && score < 0) {
                throw new AuraHandledException('점수는 0보다 작을 수 없습니다.');
            }
            
            // 점수 업데이트
            item.Score__c = score;
            update item;
            
            return '점수가 성공적으로 저장되었습니다.';
            
        } catch (Exception e) {
            System.debug('Save score error: ' + e.getMessage());
            throw new AuraHandledException('점수 저장 실패: ' + e.getMessage());
        }
    }
    
    // ⭐ Assessment 데이터 조회 (점수 정보 포함) - 실제 데이터 모델에 맞게 수정
    @AuraEnabled
    public static Map<String, Object> getAssessmentData(String sheetId) {
        try {
            if (String.isBlank(sheetId)) {
                throw new AuraHandledException('Sheet ID가 전달되지 않았습니다.');
            }

            // Assessment Sheet 조회
            List<AssessmentSheet__c> assessmentSheets = [
                SELECT Id, Name, Status__c, AssessmentTemplateId__c, AssessmentMasterId__c, AssessmentTargetId__c
                FROM AssessmentSheet__c
                WHERE Id = :sheetId
                LIMIT 1
            ];

            if (assessmentSheets.isEmpty()) {
                throw new AuraHandledException('해당 Assessment Sheet를 찾을 수 없습니다.');
            }

            AssessmentSheet__c sheet = assessmentSheets[0];

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
                       AssessmentTemplateQuestion__r.Order__c,
                       AssessmentTemplateQuestion__r.Score__c  // ⭐ 최대 점수 추가
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
                        itemMap.put('Score__c', item.Score__c);
                        itemMap.put('Answer__c', item.Answer__c);
                        itemMap.put('maxScore', item.AssessmentTemplateQuestion__r.Score__c); // ⭐ 최대 점수 추가
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

            Map<String, Object> result = new Map<String, Object>();
            result.put('id', sheet.Id);
            result.put('name', sheet.Name);
            result.put('status', sheet.Status__c);
            result.put('sections', sectionList);

            return result;

        } catch (Exception e) {
            System.debug('Get assessment data error: ' + e.getMessage());
            throw new AuraHandledException('Assessment 데이터 조회 실패: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String saveResponse(String itemId, String answer) {
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
            
            return '응답이 저장되었습니다.';

        } catch (Exception e) {
            System.debug('Save response error: ' + e.getMessage());
            throw new AuraHandledException('응답 저장 실패: ' + e.getMessage());
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
            
            // Option 1: 완료된 현재 Assessment Sheet로 이동 (기본 동작)
            result.put('navigationType', 'RECORD');
            result.put('recordId', currentSheet.Id);
            result.put('message', '완료된 평가 결과를 확인합니다.');
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
                       AssessmentTemplateQuestion__r.Score__c,  // ⭐ 최대 점수 추가
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