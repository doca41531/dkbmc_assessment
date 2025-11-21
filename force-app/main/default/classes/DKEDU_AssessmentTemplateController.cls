/**
 * @description Assessment Template Controller - DKEDU (DK Lab Standards Applied)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Controllers  
 * @created date 2025-11-03
 * @last modified on 2025-11-20
 * @last modified by mingyu.park@dkbmc.com
 * @version 2.1.1
 * @description Controller class for Assessment Template operations
 *              including creation, session management, and question score settings
 *              following DK Lab development standards with standardized logging and error handling
 *              Fixed: Question text storage issue resolved
 *              Fixed: Multiple choice options with 0 score now saved properly
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
     * @description Create Assessment Template with Sessions and Question Scores
     * @param templateData - JSON string containing template, sessions and scores data
     * @return String - JSON response with success/error information
     */
    @AuraEnabled
    public static String createAssessmentTemplate(String templateData) {
        log('createAssessmentTemplate', 'Method started', templateData);
        
        Savepoint sp = Database.setSavepoint();
        
        try {
            log('createAssessmentTemplate', 'Starting data parsing', '');
            Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(templateData);
            log('createAssessmentTemplate', 'Parsing completed', data);
            
            // Extract Assessment Template fields
            String templateName = (String) data.get('templateName');
            String templateDescription = (String) data.get('templateDescription');
            Boolean isActive = (Boolean) data.get('isActive');
            List<Object> sessionsData = (List<Object>) data.get('sessions');
            
            log('createAssessmentTemplate', 'Field extraction completed', new Map<String, Object>{
                'templateName' => templateName,
                'isActive' => isActive,
                'sessionsCount' => sessionsData != null ? sessionsData.size() : 0
            });
            
            // ========================================
            // 질문 정보 미리 조회 (수정된 부분)
            // ========================================
            Map<Id, AssessmentQuestion__c> questionDetailsMap = new Map<Id, AssessmentQuestion__c>();
            
            // 모든 질문 ID 수집
            Set<Id> allQuestionIds = new Set<Id>();
            if (sessionsData != null) {
                for (Object sessionObj : sessionsData) {
                    Map<String, Object> sessionData = (Map<String, Object>) sessionObj;
                    List<Object> questionsData = (List<Object>) sessionData.get('questions');
                    if (questionsData != null) {
                        for (Object questionObj : questionsData) {
                            Map<String, Object> questionData = (Map<String, Object>) questionObj;
                            String questionId = (String) questionData.get('questionId');
                            if (String.isNotBlank(questionId)) {
                                allQuestionIds.add(questionId);
                            }
                        }
                    }
                }
            }
            
            // 질문 정보 일괄 조회
            if (!allQuestionIds.isEmpty()) {
                log('createAssessmentTemplate', 'Loading question details for IDs', allQuestionIds.size());
                
                List<AssessmentQuestion__c> questionDetails = [
                    SELECT Id, Name, Question__c, Type__c
                    FROM AssessmentQuestion__c
                    WHERE Id IN :allQuestionIds
                ];
                
                for (AssessmentQuestion__c q : questionDetails) {
                    questionDetailsMap.put(q.Id, q);
                }
                
                log('createAssessmentTemplate', 'Question details loaded', questionDetailsMap.size());
            }
            
            // Create Assessment Template
            AssessmentTemplate__c assessmentTemplate = new AssessmentTemplate__c(
                Name = templateName,
                Description__c = templateDescription,
                IsActive__c = isActive != null ? isActive : true
            );
            
            log('createAssessmentTemplate', 'Starting Assessment Template insert', assessmentTemplate);
            insert assessmentTemplate;
            log('createAssessmentTemplate', 'Template insert completed', assessmentTemplate.Id);
            
            // Verify template was created successfully
            List<AssessmentTemplate__c> verifyTemplate = [
                SELECT Id, Name, Description__c, IsActive__c 
                FROM AssessmentTemplate__c 
                WHERE Id = :assessmentTemplate.Id 
                LIMIT 1
            ];
            
            if (verifyTemplate.isEmpty()) {
                log('createAssessmentTemplate', 'Verification failed - template not created', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'Template insert failed - record not found after creation'
                });
            }
            
            log('createAssessmentTemplate', 'Template verification successful', verifyTemplate[0]);
            
            // Create Sessions and Questions
            Integer sessionsCreated = 0;
            Integer questionsCreated = 0;
            Integer itemsCreated = 0;
            
            if (sessionsData != null && !sessionsData.isEmpty()) {
                log('createAssessmentTemplate', 'Starting sessions creation', sessionsData.size());
                
                List<AssessmentTemplateSection__c> sectionsToInsert = new List<AssessmentTemplateSection__c>();
                Map<String, Map<String, Object>> sectionQuestionMap = new Map<String, Map<String, Object>>();
                
                // Create sections first
                for (Integer i = 0; i < sessionsData.size(); i++) {
                    Map<String, Object> sessionData = (Map<String, Object>) sessionsData[i];
                    String sessionName = (String) sessionData.get('name');
                    Decimal sessionScore = Decimal.valueOf(String.valueOf(sessionData.get('score')));
                    List<Object> questionsData = (List<Object>) sessionData.get('questions');
                    
                    AssessmentTemplateSection__c section = new AssessmentTemplateSection__c(
                        AssessmentTemplate__c = assessmentTemplate.Id,
                        Name = sessionName,
                        Score__c = sessionScore,
                        Order__c = i + 1,
                        SequenceOrder__c = i + 1,
                        IsActive__c = true
                    );
                    
                    sectionsToInsert.add(section);
                    
                    // Store questions data for later processing
                    sectionQuestionMap.put(String.valueOf(i), new Map<String, Object>{
                        'questions' => questionsData
                    });
                }
                
                if (!sectionsToInsert.isEmpty()) {
                    insert sectionsToInsert;
                    sessionsCreated = sectionsToInsert.size();
                    log('createAssessmentTemplate', 'Sections insert completed', sessionsCreated);
                    
                    // Now create section questions and scores
                    List<AssessmentTemplateQuestion__c> sectionQuestionsToInsert = new List<AssessmentTemplateQuestion__c>();
                    List<AssessmentTemplateQuestionItem__c> questionItemsToInsert = new List<AssessmentTemplateQuestionItem__c>();
                    
                    for (Integer i = 0; i < sectionsToInsert.size(); i++) {
                        AssessmentTemplateSection__c section = sectionsToInsert[i];
                        Map<String, Object> sectionQuestionData = sectionQuestionMap.get(String.valueOf(i));
                        List<Object> questionsData = (List<Object>) sectionQuestionData.get('questions');
                        
                        if (questionsData != null) {
                            for (Integer j = 0; j < questionsData.size(); j++) {
                                Map<String, Object> questionData = (Map<String, Object>) questionsData[j];
                                String questionId = (String) questionData.get('questionId');
                                String questionType = (String) questionData.get('type');
                                Decimal questionScore = Decimal.valueOf(String.valueOf(questionData.get('score')));
                                List<Object> questionItemsData = (List<Object>) questionData.get('questionItems');
                                
                                // ========================================
                                // 질문 세부정보 가져오기 (수정된 부분)
                                // ========================================
                                AssessmentQuestion__c questionDetail = questionDetailsMap.get(questionId);
                                String questionText = questionDetail != null ? questionDetail.Question__c : null;
                                String resolvedQuestionType = questionType;
                                
                                // Type이 없으면 원본 질문에서 가져오기
                                if (String.isBlank(resolvedQuestionType) && questionDetail != null) {
                                    resolvedQuestionType = questionDetail.Type__c;
                                }
                                if (String.isBlank(resolvedQuestionType)) {
                                    resolvedQuestionType = 'Short Answer';
                                }
                                
                                // Create section question
                                AssessmentTemplateQuestion__c sectionQuestion = new AssessmentTemplateQuestion__c(
                                    AssessmentTemplateGroup__c = section.Id,
                                    AssessmentQuestionId__c = questionId,
                                    Question__c = questionText, // ✅ 실제 질문 텍스트 저장
                                    Order__c = j + 1,
                                    Score__c = questionScore,
                                    Type__c = resolvedQuestionType,
                                    IsActive__c = true
                                );
                                
                                sectionQuestionsToInsert.add(sectionQuestion);
                                questionsCreated++;
                                
                                log('createAssessmentTemplate', 'Question prepared for insert', new Map<String, Object>{
                                    'questionId' => questionId,
                                    'questionText' => questionText,
                                    'type' => resolvedQuestionType,
                                    'score' => questionScore
                                });
                                
                                // For Multiple Choice questions, create individual scores for question items
                                if (questionItemsData != null && !questionItemsData.isEmpty()) {
                                    for (Object itemObj : questionItemsData) {
                                        Map<String, Object> itemData = (Map<String, Object>) itemObj;
                                        String itemId = (String) itemData.get('id');
                                        String itemContent = (String) itemData.get('content');
                                        Decimal itemScore = Decimal.valueOf(String.valueOf(itemData.get('score')));
                                        
                                        // ⭐ 수정: 점수가 0이어도 저장 (내용이 있으면)
                                        if (String.isNotBlank(itemContent)) {
                                            // Note: We'll create a placeholder for now since we need the section question ID
                                            // This will be handled in a second pass after section questions are inserted
                                            itemsCreated++;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Insert section questions first
                    if (!sectionQuestionsToInsert.isEmpty()) {
                        insert sectionQuestionsToInsert;
                        log('createAssessmentTemplate', 'Section questions insert completed', questionsCreated);
                        
                        // Now create question items in second pass
                        for (Integer i = 0; i < sectionsToInsert.size(); i++) {
                            AssessmentTemplateSection__c section = sectionsToInsert[i];
                            Map<String, Object> sectionQuestionData = sectionQuestionMap.get(String.valueOf(i));
                            List<Object> questionsData = (List<Object>) sectionQuestionData.get('questions');
                            
                            if (questionsData != null) {
                                for (Integer j = 0; j < questionsData.size(); j++) {
                                    Map<String, Object> questionData = (Map<String, Object>) questionsData[j];
                                    List<Object> questionItemsData = (List<Object>) questionData.get('questionItems');
                                    
                                    // Find the corresponding section question
                                    AssessmentTemplateQuestion__c currentSectionQuestion = null;
                                    for (AssessmentTemplateQuestion__c sq : sectionQuestionsToInsert) {
                                        if (sq.AssessmentTemplateGroup__c == section.Id && sq.Order__c == j + 1) {
                                            currentSectionQuestion = sq;
                                            break;
                                        }
                                    }
                                    
                                    if (currentSectionQuestion != null) {
                                        // ⭐ 수정: Assessment Question에서 직접 옵션 조회 후 복사
                                        String questionType = currentSectionQuestion.Type__c;
                                        if (questionType == 'Choosable' || questionType == 'Multi Choosable') {
                                            // Assessment Question Item에서 해당 질문의 옵션들 조회
                                            List<AssessmentQuestionItem__c> originalItems = [
                                                SELECT Id, Content__c, Order__c
                                                FROM AssessmentQuestionItem__c
                                                WHERE AssessmentQuestion__c = :currentSectionQuestion.AssessmentQuestionId__c
                                                ORDER BY Order__c
                                            ];
                                            
                                            log('createAssessmentTemplate', 'Original question items found', originalItems.size());
                                            
                                            // 각 옵션을 Assessment Template Question Item으로 복사
                                            for (AssessmentQuestionItem__c originalItem : originalItems) {
                                                // 프론트엔드에서 설정한 점수가 있으면 사용, 없으면 0
                                                Decimal itemScore = 0;
                                                if (questionItemsData != null) {
                                                    for (Object itemObj : questionItemsData) {
                                                        Map<String, Object> itemData = (Map<String, Object>) itemObj;
                                                        String itemId = (String) itemData.get('id');
                                                        if (itemId == originalItem.Id) {
                                                            itemScore = Decimal.valueOf(String.valueOf(itemData.get('score')));
                                                            break;
                                                        }
                                                    }
                                                }
                                                
                                                AssessmentTemplateQuestionItem__c questionItem = new AssessmentTemplateQuestionItem__c(
                                                    AssessmentTemplateQuestion__c = currentSectionQuestion.Id,
                                                    Content__c = originalItem.Content__c,
                                                    Order__c = originalItem.Order__c,
                                                    Score__c = itemScore,
                                                    AssessmentQuestionItemId__c = originalItem.Id
                                                );
                                                
                                                questionItemsToInsert.add(questionItem);
                                                
                                                log('createAssessmentTemplate', 'Question item prepared', new Map<String, Object>{
                                                    'originalId' => originalItem.Id,
                                                    'content' => originalItem.Content__c,
                                                    'score' => itemScore
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Insert question items
                        if (!questionItemsToInsert.isEmpty()) {
                            insert questionItemsToInsert;
                            itemsCreated = questionItemsToInsert.size();
                            log('createAssessmentTemplate', 'Question items insert completed', itemsCreated);
                        }
                    }
                }
            }
            
            // Return success response
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'message' => 'Assessment Template has been successfully created.',
                'templateId' => assessmentTemplate.Id,
                'templateName' => assessmentTemplate.Name,
                'sectionsCreated' => sessionsCreated,
                'questionsCreated' => questionsCreated,
                'itemsCreated' => itemsCreated
            };
            
            log('createAssessmentTemplate', 'Success response prepared', response);
            return JSON.serialize(response);
            
        } catch (Exception e) {
            log('createAssessmentTemplate', 'Exception occurred, rolling back', e.getMessage());
            Database.rollback(sp);
            
            // Return error response  
            Map<String, Object> response = new Map<String, Object>{
                'success' => false,
                'message' => 'An error occurred while creating template: ' + e.getMessage(),
                'error' => e.getStackTraceString()
            };
            
            return JSON.serialize(response);
        }
    }
    
    /**
     * @description Get Assessment Template Details with related sections and questions
     * @param templateId - Assessment Template Id
     * @return String - JSON response with template details
     */
    @AuraEnabled(cacheable=true)
    public static String getAssessmentTemplateDetails(String templateId) {
        log('getAssessmentTemplateDetails', 'Method started', templateId);
        
        try {
            if (String.isBlank(templateId)) {
                log('getAssessmentTemplateDetails', 'templateId is blank', '');
                throw new AuraHandledException('Template ID is required');
            }
            
            // Get template
            List<AssessmentTemplate__c> templates = [
                SELECT Id, Name, Description__c, IsActive__c, CreatedDate, LastModifiedDate
                FROM AssessmentTemplate__c
                WHERE Id = :templateId
                LIMIT 1
            ];
            
            if (templates.isEmpty()) {
                throw new AuraHandledException('Template not found');
            }
            
            AssessmentTemplate__c template = templates[0];
            
            // Get sections
            List<AssessmentTemplateSection__c> sections = [
                SELECT Id, Name, Score__c, Order__c, SequenceOrder__c, IsActive__c
                FROM AssessmentTemplateSection__c
                WHERE AssessmentTemplate__c = :templateId
                ORDER BY Order__c
            ];
            
            // Get section questions
            Map<Id, List<AssessmentTemplateQuestion__c>> sectionQuestionsMap = new Map<Id, List<AssessmentTemplateQuestion__c>>();
            
            if (!sections.isEmpty()) {
                List<Id> sectionIds = new List<Id>();
                for (AssessmentTemplateSection__c section : sections) {
                    sectionIds.add(section.Id);
                }
                
                List<AssessmentTemplateQuestion__c> sectionQuestions = [
                    SELECT Id, AssessmentTemplateGroup__c, AssessmentQuestionId__c, Question__c, 
                           Order__c, Score__c, Type__c, IsActive__c
                    FROM AssessmentTemplateQuestion__c
                    WHERE AssessmentTemplateGroup__c IN :sectionIds
                    ORDER BY AssessmentTemplateGroup__c, Order__c
                ];
                
                for (AssessmentTemplateQuestion__c question : sectionQuestions) {
                    if (!sectionQuestionsMap.containsKey(question.AssessmentTemplateGroup__c)) {
                        sectionQuestionsMap.put(question.AssessmentTemplateGroup__c, new List<AssessmentTemplateQuestion__c>());
                    }
                    sectionQuestionsMap.get(question.AssessmentTemplateGroup__c).add(question);
                }
            }
            
            // Get question items for questions
            Map<Id, List<AssessmentTemplateQuestionItem__c>> questionItemsMap = new Map<Id, List<AssessmentTemplateQuestionItem__c>>();
            
            if (!sectionQuestionsMap.isEmpty()) {
                List<Id> allQuestionIds = new List<Id>();
                for (List<AssessmentTemplateQuestion__c> questions : sectionQuestionsMap.values()) {
                    for (AssessmentTemplateQuestion__c question : questions) {
                        allQuestionIds.add(question.Id);
                    }
                }
                
                if (!allQuestionIds.isEmpty()) {
                    List<AssessmentTemplateQuestionItem__c> questionItems = [
                        SELECT Id, AssessmentTemplateQuestion__c, Content__c, Order__c, Score__c, AssessmentQuestionItemId__c
                        FROM AssessmentTemplateQuestionItem__c
                        WHERE AssessmentTemplateQuestion__c IN :allQuestionIds
                        ORDER BY AssessmentTemplateQuestion__c, Order__c
                    ];
                    
                    for (AssessmentTemplateQuestionItem__c item : questionItems) {
                        if (!questionItemsMap.containsKey(item.AssessmentTemplateQuestion__c)) {
                            questionItemsMap.put(item.AssessmentTemplateQuestion__c, new List<AssessmentTemplateQuestionItem__c>());
                        }
                        questionItemsMap.get(item.AssessmentTemplateQuestion__c).add(item);
                    }
                }
            }
            
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'template' => template,
                'sections' => sections,
                'sectionQuestions' => sectionQuestionsMap,
                'questionItems' => questionItemsMap
            };
            
            log('getAssessmentTemplateDetails', 'Template details retrieved', sections.size());
            return JSON.serialize(response);
            
        } catch (Exception e) {
            log('getAssessmentTemplateDetails', 'Exception occurred', e.getMessage());
            
            Map<String, Object> response = new Map<String, Object>{
                'success' => false,
                'message' => 'An error occurred while retrieving template details: ' + e.getMessage(),
                'error' => e.getStackTraceString()
            };
            
            return JSON.serialize(response);
        }
    }
    
    /**
     * @description Get Assessment Template Sections for a specific template
     * @param templateId - Assessment Template Id
     * @return List<AssessmentTemplateSection__c> - List of sections
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentTemplateSection__c> getAssessmentTemplateSections(String templateId) {
        log('getAssessmentTemplateSections', 'Method started', templateId);
        
        try {
            if (String.isBlank(templateId)) {
                log('getAssessmentTemplateSections', 'templateId is blank', '');
                return new List<AssessmentTemplateSection__c>();
            }
            
            List<AssessmentTemplateSection__c> sections = [
                SELECT Id, Name, Score__c, Order__c, IsActive__c
                FROM AssessmentTemplateSection__c 
                WHERE AssessmentTemplate__c = :templateId 
                AND IsActive__c = true
                ORDER BY Order__c
            ];
            
            log('getAssessmentTemplateSections', 'Sections query completed', sections.size());
            return sections;
            
        } catch (Exception e) {
            log('getAssessmentTemplateSections', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving template sections: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get available Assessment Questions for template creation
     * @return List<AssessmentQuestion__c> - List of active questions for dual box Available Questions
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestion__c> getAvailableQuestions() {
        log('getAvailableQuestions', 'Method started', '');
        
        try {
            // Get questions that:
            // 1. HasRelatedQuestion__c = false or null (no related questions)
            // 2. HasRelatedQuestion__c = true but RelatedQuestionId__c and RelatedCriteria__c are null
            List<AssessmentQuestion__c> questions = [
                SELECT Id, Name, Question__c, Type__c, IsActive__c, 
                       HasRelatedQuestion__c, RelatedQuestionId__c, RelatedCriteria__c
                FROM AssessmentQuestion__c 
                WHERE IsActive__c = true 
                AND (
                    HasRelatedQuestion__c = false 
                    OR HasRelatedQuestion__c = null
                    OR (HasRelatedQuestion__c = true 
                        AND RelatedQuestionId__c = null 
                        AND RelatedCriteria__c = null)
                )
                ORDER BY CreatedDate DESC
                LIMIT 500
            ];
            
            log('getAvailableQuestions', 'Questions query completed', questions.size());
            return questions;
            
        } catch (Exception e) {
            log('getAvailableQuestions', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving questions: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get child questions for a given parent question
     * @param {Id} parentQuestionId - Parent question ID
     * @return List<AssessmentQuestion__c> - List of child questions
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestion__c> getChildQuestions(Id parentQuestionId) {
        log('getChildQuestions', 'Method started for parent', parentQuestionId);
        
        try {
            List<AssessmentQuestion__c> childQuestions = [
                SELECT Id, Name, Question__c, Type__c, IsActive__c, 
                       HasRelatedQuestion__c, RelatedQuestionId__c
                FROM AssessmentQuestion__c 
                WHERE IsActive__c = true 
                AND RelatedQuestionId__c = :parentQuestionId
                ORDER BY CreatedDate ASC
            ];
            
            log('getChildQuestions', 'Child questions found', childQuestions.size());
            return childQuestions;
            
        } catch (Exception e) {
            log('getChildQuestions', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving child questions: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get question items (answer options) for multiple choice questions
     * @param {List<Id>} questionIds - List of question IDs
     * @return List<AssessmentQuestionItem__c> - List of question items
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestionItem__c> getQuestionItems(List<Id> questionIds) {
        log('getQuestionItems', 'Method started for questions', questionIds);
        
        try {
            List<AssessmentQuestionItem__c> items = [
                SELECT Id, Name, Content__c, Order__c, AssessmentQuestion__c
                FROM AssessmentQuestionItem__c 
                WHERE AssessmentQuestion__c IN :questionIds
                ORDER BY AssessmentQuestion__c, Order__c ASC
            ];
            
            log('getQuestionItems', 'Question items found', items.size());
            return items;
            
        } catch (Exception e) {
            log('getQuestionItems', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving question items: ' + e.getMessage());
        }
    }
}