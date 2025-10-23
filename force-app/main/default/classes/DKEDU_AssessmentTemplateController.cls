/**
 * @description Assessment Template Controller - DKEDU (Fixed Version)
 * @author developer@company.com
 * @group DKEDU Controllers
 * @created date 2025-01-15
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.3.1
 */
public with sharing class DKEDU_AssessmentTemplateController {
    
    // ========================================
    // CONSTANTS AND DEBUG SETTINGS
    // ========================================
    
    private static final Boolean DEBUG = false;
    
    // ========================================
    // UTILITY METHODS
    // ========================================
    
    /**
     * @description Debug logging utility method
     * @param {String} methodName - Name of the method calling log
     * @param {String} message - Message to log
     * @param {Object} variable - Variable to log (optional)
     */
    private static void log(String methodName, String message, Object variable) {
        if (DEBUG) {
            try {
                String logMessage = 'DKEDU_AssessmentTemplateController ' + methodName + ' ' + message + ' ==>';
                if (variable != null) {
                    System.debug(logMessage + ' ' + JSON.serialize(variable));
                } else {
                    System.debug(logMessage);
                }
            } catch (Exception e) {
                System.debug('DKEDU_AssessmentTemplateController ' + methodName + ' [Logging Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    // ========================================
    // WEBSERVICE METHODS
    // ========================================
    
    /**
     * @description Get available Assessment Questions for template creation
     * @return List of Assessment Questions
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestion__c> getAvailableQuestions() {
        log('getAvailableQuestions', 'Method started', '');
        
        try {
            List<AssessmentQuestion__c> questions = [
                SELECT Id, Name, Type__c, Question__c, IsActive__c, FileIncluded__c,
                       HasRelatedQuestion__c, RelatedQuestionId__c, RelatedCriteria__c
                FROM AssessmentQuestion__c 
                WHERE IsActive__c = true
                ORDER BY Name ASC
                LIMIT 1000
            ];
            
            log('getAvailableQuestions', 'Questions retrieved successfully', questions.size());
            return questions;
        } catch (Exception e) {
            log('getAvailableQuestions', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('Failed to retrieve available questions: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Question Items for multiple questions (선다형 질문들의 선택지)
     * @param questionIds List of Assessment Question IDs
     * @return List of Assessment Question Items
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestionItem__c> getQuestionItems(List<String> questionIds) {
        log('getQuestionItems', 'Method started', questionIds);
        
        try {
            if (questionIds == null || questionIds.isEmpty()) {
                log('getQuestionItems', 'No question IDs provided', '');
                return new List<AssessmentQuestionItem__c>();
            }
            
            List<AssessmentQuestionItem__c> items = [
                SELECT Id, Name, Content__c, Order__c, AssessmentQuestion__c
                FROM AssessmentQuestionItem__c
                WHERE AssessmentQuestion__c IN :questionIds
                ORDER BY AssessmentQuestion__c, Order__c ASC
            ];
            
            log('getQuestionItems', 'Question items retrieved successfully', items.size());
            return items;
        } catch (Exception e) {
            log('getQuestionItems', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('Failed to retrieve question items: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Question Items for a single question (기존 호환성 유지)
     * @param questionId The ID of the Assessment Question
     * @return List of Assessment Question Items
     */
    @AuraEnabled
    public static List<AssessmentQuestionItem__c> getSingleQuestionItems(String questionId) {
        log('getSingleQuestionItems', 'Method started', questionId);
        
        try {
            if (String.isBlank(questionId)) {
                log('getSingleQuestionItems', 'Question ID is blank', '');
                return new List<AssessmentQuestionItem__c>();
            }
            
            List<AssessmentQuestionItem__c> items = [
                SELECT Id, Name, Content__c, Order__c
                FROM AssessmentQuestionItem__c
                WHERE AssessmentQuestion__c = :questionId
                ORDER BY Order__c ASC
            ];
            
            log('getSingleQuestionItems', 'Question items retrieved successfully', items.size());
            return items;
        } catch (Exception e) {
            log('getSingleQuestionItems', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('Failed to retrieve question items: ' + e.getMessage());
        }
    }
    
    /**
     * @description Create new Assessment Template with sessions and questions (점수 포함)
     * @param templateData JSON string containing template information with question scores
     * @return Result string with success/error information
     */
    @AuraEnabled
    public static String createAssessmentTemplate(String templateData) {
        log('createAssessmentTemplate', 'Method started', templateData);
        
        Savepoint sp = Database.setSavepoint();
        
        try {
            // Parse the template data
            Map<String, Object> templateMap = (Map<String, Object>) JSON.deserializeUntyped(templateData);
            log('createAssessmentTemplate', 'Template data parsed', templateMap);
            
            // Create Assessment Template record
            AssessmentTemplate__c template = new AssessmentTemplate__c();
            
            // 템플릿 기본 정보 설정
            template.Name = (String) templateMap.get('templateName');
            template.IsActive__c = (Boolean) templateMap.get('isActive');
            
            // Description 필드에 추가 설명 저장
            String description = (String) templateMap.get('description');
            if (!String.isBlank(description)) {
                template.Description__c = description;
            }
            
            insert template;
            log('createAssessmentTemplate', 'Assessment Template created', template.Id);
            
            // Get sessions data
            List<Object> sessions = (List<Object>) templateMap.get('sessions');
            if (sessions != null && !sessions.isEmpty()) {
                
                // Create Assessment Template Sections (Sessions)
                List<AssessmentTemplateSection__c> sectionsToInsert = new List<AssessmentTemplateSection__c>();
                
                for (Integer i = 0; i < sessions.size(); i++) {
                    Map<String, Object> sessionMap = (Map<String, Object>) sessions[i];
                    
                    AssessmentTemplateSection__c section = new AssessmentTemplateSection__c();
                    section.AssessmentTemplate__c = template.Id;
                    section.IsActive__c = true;
                    section.Order__c = i + 1;
                    section.SequenceOrder__c = i + 1;
                    section.Name = (String) sessionMap.get('name');
                    
                    // 세션 점수 설정
                    Object scoreObj = sessionMap.get('score');
                    section.Score__c = parseDecimalValue(scoreObj, 0);
                    
                    sectionsToInsert.add(section);
                }
                
                insert sectionsToInsert;
                log('createAssessmentTemplate', 'Assessment Template Sections created', sectionsToInsert.size());
                
                // 질문 및 선택지 생성
                createTemplateQuestionsAndItems(sessions, sectionsToInsert);
            }
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', true);
            result.put('message', 'Assessment Template created successfully');
            result.put('templateId', template.Id);
            
            String resultJson = JSON.serialize(result);
            log('createAssessmentTemplate', 'Success response prepared', result);
            return resultJson;
            
        } catch (DmlException e) {
            Database.rollback(sp);
            log('createAssessmentTemplate', 'DML Error occurred', e.getMessage());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', 'Database error: ' + e.getDmlMessage(0));
            
            return JSON.serialize(result);
            
        } catch (Exception e) {
            Database.rollback(sp);
            log('createAssessmentTemplate', 'Exception occurred', e.getMessage());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', 'Error creating template: ' + e.getMessage());
            
            return JSON.serialize(result);
        }
    }
    
    /**
     * @description Create template questions and their items with individual scores
     * @param sessions List of session data
     * @param sectionsToInsert List of inserted sections
     */
    private static void createTemplateQuestionsAndItems(List<Object> sessions, List<AssessmentTemplateSection__c> sectionsToInsert) {
        log('createTemplateQuestionsAndItems', 'Method started', sessions.size());
        
        try {
            // Collect all question IDs to fetch their data in batch
            Set<String> allQuestionIds = new Set<String>();
            for (Object sessionObj : sessions) {
                Map<String, Object> sessionMap = (Map<String, Object>) sessionObj;
                List<Object> selectedQuestions = (List<Object>) sessionMap.get('selectedQuestions');
                if (selectedQuestions != null) {
                    for (Object questionObj : selectedQuestions) {
                        Map<String, Object> questionMap = (Map<String, Object>) questionObj;
                        allQuestionIds.add((String) questionMap.get('id'));
                    }
                }
            }
            
            // Get original questions
            Map<Id, AssessmentQuestion__c> originalQuestionsMap = new Map<Id, AssessmentQuestion__c>([
                SELECT Id, Name, Type__c, Question__c, FileIncluded__c
                FROM AssessmentQuestion__c 
                WHERE Id IN :allQuestionIds
            ]);
            log('createTemplateQuestionsAndItems', 'Original questions fetched', originalQuestionsMap.size());
            
            // Get question items for choice-based questions
            Map<Id, List<AssessmentQuestionItem__c>> questionItemsMap = new Map<Id, List<AssessmentQuestionItem__c>>();
            List<AssessmentQuestionItem__c> allQuestionItems = [
                SELECT Id, Name, Content__c, Order__c, AssessmentQuestion__c
                FROM AssessmentQuestionItem__c
                WHERE AssessmentQuestion__c IN :allQuestionIds
                ORDER BY AssessmentQuestion__c, Order__c
            ];
            
            for (AssessmentQuestionItem__c item : allQuestionItems) {
                if (!questionItemsMap.containsKey(item.AssessmentQuestion__c)) {
                    questionItemsMap.put(item.AssessmentQuestion__c, new List<AssessmentQuestionItem__c>());
                }
                questionItemsMap.get(item.AssessmentQuestion__c).add(item);
            }
            log('createTemplateQuestionsAndItems', 'Question items mapped', questionItemsMap.size());
            
            // Create template questions
            List<AssessmentTemplateQuestion__c> templateQuestionsToInsert = new List<AssessmentTemplateQuestion__c>();
            List<Map<String, Object>> templateQuestionItemsData = new List<Map<String, Object>>();
            
            for (Integer i = 0; i < sessions.size(); i++) {
                Map<String, Object> sessionMap = (Map<String, Object>) sessions[i];
                List<Object> selectedQuestions = (List<Object>) sessionMap.get('selectedQuestions');
                
                if (selectedQuestions != null && !selectedQuestions.isEmpty()) {
                    for (Integer j = 0; j < selectedQuestions.size(); j++) {
                        Map<String, Object> questionMap = (Map<String, Object>) selectedQuestions[j];
                        String questionId = (String) questionMap.get('id');
                        AssessmentQuestion__c originalQuestion = originalQuestionsMap.get(questionId);
                        
                        if (originalQuestion != null) {
                            AssessmentTemplateQuestion__c templateQuestion = new AssessmentTemplateQuestion__c();
                            // 수정된 필드명 사용: AssessmentQuestionId__c (Id 포함)
                            templateQuestion.AssessmentTemplateGroup__c = sectionsToInsert[i].Id;
                            templateQuestion.Type__c = originalQuestion.Type__c;
                            templateQuestion.Question__c = originalQuestion.Question__c;
                            templateQuestion.Order__c = j + 1;
                            templateQuestion.IsActive__c = true;
                            templateQuestion.FileIncluded__c = originalQuestion.FileIncluded__c;
                            templateQuestion.AssessmentQuestionId__c = originalQuestion.Id; // 수정된 필드명 (Id 포함)
                            
                            // 개별 질문 점수 설정 (2단계에서 입력된 점수)
                            Object questionScoreObj = questionMap.get('score');
                            templateQuestion.Score__c = parseDecimalValue(questionScoreObj, 0);
                            
                            templateQuestionsToInsert.add(templateQuestion);
                            
                            // Check if this question has items and score data
                            if (questionItemsMap.containsKey(questionId)) {
                                List<Object> itemsData = (List<Object>) questionMap.get('items');
                                List<AssessmentQuestionItem__c> questionItems = questionItemsMap.get(questionId);
                                
                                // 선택지별 점수 데이터가 있는 경우 처리
                                if (itemsData != null && !itemsData.isEmpty()) {
                                    // Create a map for quick lookup of item scores
                                    Map<String, Decimal> itemScoreMap = new Map<String, Decimal>();
                                    for (Object itemDataObj : itemsData) {
                                        Map<String, Object> itemDataMap = (Map<String, Object>) itemDataObj;
                                        String itemId = (String) itemDataMap.get('id');
                                        Object itemScoreObj = itemDataMap.get('score');
                                        itemScoreMap.put(itemId, parseDecimalValue(itemScoreObj, 0));
                                    }
                                    
                                    // Process original question items with scores
                                    for (AssessmentQuestionItem__c originalItem : questionItems) {
                                        Map<String, Object> itemData = new Map<String, Object>();
                                        itemData.put('templateQuestionIndex', templateQuestionsToInsert.size() - 1);
                                        itemData.put('name', originalItem.Name);
                                        itemData.put('content', originalItem.Content__c);
                                        itemData.put('order', originalItem.Order__c);
                                        itemData.put('originalId', originalItem.Id);
                                        
                                        // 개별 선택지 점수 설정
                                        Decimal itemScore = itemScoreMap.containsKey(originalItem.Id) ? 
                                                           itemScoreMap.get(originalItem.Id) : 0;
                                        itemData.put('score', itemScore);
                                        
                                        templateQuestionItemsData.add(itemData);
                                    }
                                } else {
                                    // 점수 데이터가 없는 경우 기본값 0으로 설정
                                    for (AssessmentQuestionItem__c originalItem : questionItems) {
                                        Map<String, Object> itemData = new Map<String, Object>();
                                        itemData.put('templateQuestionIndex', templateQuestionsToInsert.size() - 1);
                                        itemData.put('name', originalItem.Name);
                                        itemData.put('content', originalItem.Content__c);
                                        itemData.put('order', originalItem.Order__c);
                                        itemData.put('originalId', originalItem.Id);
                                        itemData.put('score', 0); // 기본값
                                        templateQuestionItemsData.add(itemData);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Insert template questions
            if (!templateQuestionsToInsert.isEmpty()) {
                insert templateQuestionsToInsert;
                log('createTemplateQuestionsAndItems', 'Assessment Template Questions created', templateQuestionsToInsert.size());
                
                // Create Assessment Template Question Items
                createTemplateQuestionItems(templateQuestionItemsData, templateQuestionsToInsert);
            }
        } catch (Exception e) {
            log('createTemplateQuestionsAndItems', 'Exception occurred', e.getMessage());
            throw e;
        }
    }
    
    /**
     * @description Create template question items with scores
     * @param templateQuestionItemsData List of item data
     * @param templateQuestionsToInsert List of inserted template questions
     */
    private static void createTemplateQuestionItems(List<Map<String, Object>> templateQuestionItemsData, 
                                                   List<AssessmentTemplateQuestion__c> templateQuestionsToInsert) {
        log('createTemplateQuestionItems', 'Method started', templateQuestionItemsData.size());
        
        try {
            List<AssessmentTemplateQuestionItem__c> templateQuestionItemsToInsert = new List<AssessmentTemplateQuestionItem__c>();
            
            for (Map<String, Object> itemData : templateQuestionItemsData) {
                Integer templateQuestionIndex = (Integer) itemData.get('templateQuestionIndex');
                AssessmentTemplateQuestion__c templateQuestion = templateQuestionsToInsert[templateQuestionIndex];
                
                AssessmentTemplateQuestionItem__c templateQuestionItem = new AssessmentTemplateQuestionItem__c();
                
                // 필수 필드들 설정
                templateQuestionItem.AssessmentTemplateQuestion__c = templateQuestion.Id;
                templateQuestionItem.Content__c = (String) itemData.get('content');
                templateQuestionItem.Order__c = (Decimal) itemData.get('order');
                
                // 개별 선택지 점수 설정 (2단계에서 입력된 점수)
                Object scoreObj = itemData.get('score');
                templateQuestionItem.Score__c = parseDecimalValue(scoreObj, 0);
                
                // 올바른 API 필드명 사용 - 스키마에서 확인된 필드명
                String originalItemId = (String) itemData.get('originalId');
                if (!String.isBlank(originalItemId)) {
                    // 스키마에 따라 AssessmentQuestionItemId__c 필드 사용 (정확한 필드명)
                    templateQuestionItem.AssessmentQuestionItemId__c = originalItemId;
                    templateQuestionItemsToInsert.add(templateQuestionItem);
                    
                    log('createTemplateQuestionItems', 'Creating Assessment Template Question Item', 
                        'TemplateQuestion=' + templateQuestion.Id + 
                        ', Content=' + templateQuestionItem.Content__c + 
                        ', Score=' + templateQuestionItem.Score__c + 
                        ', OriginalItemId=' + originalItemId);
                } else {
                    log('createTemplateQuestionItems', 'ERROR: AssessmentQuestionItemId__c is required but missing for', itemData.get('content'));
                }
            }
            
            if (!templateQuestionItemsToInsert.isEmpty()) {
                insert templateQuestionItemsToInsert;
                log('createTemplateQuestionItems', 'SUCCESS: Assessment Template Question Items created', templateQuestionItemsToInsert.size());
                
                // 저장된 레코드 확인을 위한 추가 로그
                for (AssessmentTemplateQuestionItem__c item : templateQuestionItemsToInsert) {
                    log('createTemplateQuestionItems', 'Saved Assessment Template Question Item', 'Id=' + item.Id + 
                        ', Content=' + item.Content__c + 
                        ', Score=' + item.Score__c);
                }
            }
        } catch (Exception e) {
            log('createTemplateQuestionItems', 'Exception occurred', e.getMessage());
            throw e;
        }
    }
    
    /**
     * @description Utility method to safely parse decimal values
     * @param value Object to parse
     * @param defaultValue Default value if parsing fails
     * @return Parsed decimal value or default
     */
    private static Decimal parseDecimalValue(Object value, Decimal defaultValue) {
        try {
            if (value == null) {
                return defaultValue;
            }
            
            if (value instanceof Decimal) {
                return (Decimal) value;
            }
            
            if (value instanceof String) {
                String stringValue = (String) value;
                if (String.isBlank(stringValue)) {
                    return defaultValue;
                }
                
                return Decimal.valueOf(stringValue);
            }
            
            if (value instanceof Integer) {
                return Decimal.valueOf((Integer) value);
            }
            
            if (value instanceof Double) {
                return Decimal.valueOf((Double) value);
            }
            
            log('parseDecimalValue', 'Unexpected value type for decimal conversion', value + ', using default: ' + defaultValue);
            return defaultValue;
        } catch (Exception e) {
            log('parseDecimalValue', 'Invalid decimal format', value + ', using default: ' + defaultValue + ', Error: ' + e.getMessage());
            return defaultValue;
        }
    }
    
    /**
     * @description Get question types for picklist
     * @return List of picklist values
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getQuestionTypes() {
        log('getQuestionTypes', 'Method started', '');
        
        try {
            List<Map<String, String>> questionTypes = new List<Map<String, String>>();
            
            Schema.DescribeFieldResult fieldResult = AssessmentQuestion__c.Type__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            
            for (Schema.PicklistEntry entry : picklistValues) {
                if (entry.isActive()) {
                    Map<String, String> typeOption = new Map<String, String>();
                    typeOption.put('label', entry.getLabel());
                    typeOption.put('value', entry.getValue());
                    questionTypes.add(typeOption);
                }
            }
            
            log('getQuestionTypes', 'Question types retrieved successfully', questionTypes.size());
            return questionTypes;
            
        } catch (Exception e) {
            log('getQuestionTypes', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('Failed to retrieve question types: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validate template data before saving (추가 검증 메서드)
     * @param templateData JSON string containing template information
     * @return Validation result
     */
    @AuraEnabled
    public static Map<String, Object> validateTemplateData(String templateData) {
        log('validateTemplateData', 'Method started', templateData);
        
        Map<String, Object> result = new Map<String, Object>();
        List<String> errors = new List<String>();
        
        try {
            Map<String, Object> templateMap = (Map<String, Object>) JSON.deserializeUntyped(templateData);
            
            // Template name validation
            String templateName = (String) templateMap.get('templateName');
            if (String.isBlank(templateName)) {
                errors.add('Template name is required');
            }
            
            // Sessions validation
            List<Object> sessions = (List<Object>) templateMap.get('sessions');
            if (sessions == null || sessions.isEmpty()) {
                errors.add('At least one session is required');
            } else {
                for (Integer i = 0; i < sessions.size(); i++) {
                    Map<String, Object> sessionMap = (Map<String, Object>) sessions[i];
                    
                    // Session name validation
                    String sessionName = (String) sessionMap.get('name');
                    if (String.isBlank(sessionName)) {
                        errors.add('Session ' + (i + 1) + ' name is required');
                    }
                    
                    // Session score validation
                    Object sessionScoreObj = sessionMap.get('score');
                    Decimal sessionScore = parseDecimalValue(sessionScoreObj, -1);
                    if (sessionScore < 0) {
                        errors.add('Session ' + (i + 1) + ' must have a valid score');
                    }
                    
                    // Questions validation
                    List<Object> selectedQuestions = (List<Object>) sessionMap.get('selectedQuestions');
                    if (selectedQuestions == null || selectedQuestions.isEmpty()) {
                        errors.add('Session ' + (i + 1) + ' must have at least one question');
                    } else {
                        // Validate question scores sum equals session score
                        Decimal questionsTotal = 0;
                        for (Object questionObj : selectedQuestions) {
                            Map<String, Object> questionMap = (Map<String, Object>) questionObj;
                            Object questionScoreObj = questionMap.get('score');
                            Decimal questionScore = parseDecimalValue(questionScoreObj, 0);
                            questionsTotal += questionScore;
                        }
                        
                        if (Math.abs(sessionScore - questionsTotal) > 0.01) {
                            errors.add('Session ' + (i + 1) + ' score (' + sessionScore + ') must equal sum of question scores (' + questionsTotal + ')');
                        }
                    }
                }
            }
            
            result.put('isValid', errors.isEmpty());
            result.put('errors', errors);
            
            log('validateTemplateData', 'Validation completed', result);
            
        } catch (Exception e) {
            log('validateTemplateData', 'Exception occurred', e.getMessage());
            result.put('isValid', false);
            result.put('errors', new List<String>{'Error validating template data: ' + e.getMessage()});
        }
        
        return result;
    }
}