/**
 * @description Assessment Question Controller - DKEDU (DK Lab Standards Applied)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Controllers  
 * @created date 2025-09-25
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.2.0
 * @description Controller class for Assessment Question operations
 *              including creation, retrieval, and item management
 *              following DK Lab development standards with standardized logging and error handling
 */
public with sharing class DKEDU_AssessmentQuestionController {
    
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
                String logMessage = 'DKEDU_AssessmentQuestionController ' + methodName + ' ' + message + ' ==>';
                if (variable != null) {
                    System.debug(logMessage + ' ' + JSON.serialize(variable));
                } else {
                    System.debug(logMessage);
                }
            } catch (Exception e) {
                System.debug('DKEDU_AssessmentQuestionController ' + methodName + ' [Logging Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    // ========================================
    // WEBSERVICE METHODS  
    // ========================================
    
    /**
     * @description Create Assessment Question with Question Items
     * @param questionData - JSON string containing question and items data
     * @return String - JSON response with success/error information
     */
    @AuraEnabled
    public static String createAssessmentQuestion(String questionData) {
        log('createAssessmentQuestion', 'Method started', questionData);
        
        try {
            log('createAssessmentQuestion', 'Starting data parsing', '');
            Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(questionData);
            log('createAssessmentQuestion', 'Parsing completed', data);
            
            // Extract Assessment Question fields
            String questionType = (String) data.get('questionType');
            String questionText = (String) data.get('questionText');
            Boolean hasRelatedQuestion = (Boolean) data.get('hasRelatedQuestion');
            String relatedQuestionId = (String) data.get('relatedQuestionId');
            String relatedCriteria = (String) data.get('relatedCriteria');
            Boolean fileIncluded = (Boolean) data.get('fileIncluded');
            
            log('createAssessmentQuestion', 'Field extraction completed', new Map<String, Object>{
                'questionType' => questionType,
                'questionText' => questionText,
                'hasRelatedQuestion' => hasRelatedQuestion
            });
            
            // Create Assessment Question
            AssessmentQuestion__c assessmentQuestion = new AssessmentQuestion__c(
                Type__c = questionType,
                Question__c = questionText,
                HasRelatedQuestion__c = hasRelatedQuestion,
                FileIncluded__c = fileIncluded
            );
            
            // Set related question if specified
            if (hasRelatedQuestion && String.isNotBlank(relatedQuestionId)) {
                assessmentQuestion.RelatedQuestionId__c = relatedQuestionId;
                assessmentQuestion.RelatedCriteria__c = relatedCriteria;
                log('createAssessmentQuestion', 'Related question configured', relatedQuestionId);
            }
            
            log('createAssessmentQuestion', 'Starting Assessment Question insert', assessmentQuestion);
            insert assessmentQuestion;
            log('createAssessmentQuestion', 'Insert completed', assessmentQuestion.Id);
            
            // Verify question was created successfully
            List<AssessmentQuestion__c> verifyQuestion = [
                SELECT Id, Name, Type__c, Question__c 
                FROM AssessmentQuestion__c 
                WHERE Id = :assessmentQuestion.Id 
                LIMIT 1
            ];
            
            if (verifyQuestion.isEmpty()) {
                log('createAssessmentQuestion', 'Verification failed - question not created', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'Question insert failed - record not found after creation'
                });
            }
            
            log('createAssessmentQuestion', 'Question verification successful', verifyQuestion[0]);
            
            // Create Assessment Question Items (choices) if they exist
            List<Object> choiceItems = (List<Object>) data.get('choices');
            Integer itemsCreated = 0;
            
            if (choiceItems != null && !choiceItems.isEmpty()) {
                log('createAssessmentQuestion', 'Starting choice creation', choiceItems.size());
                List<AssessmentQuestionItem__c> questionItems = new List<AssessmentQuestionItem__c>();
                
                for (Integer i = 0; i < choiceItems.size(); i++) {
                    String choiceText = String.valueOf(choiceItems[i]);
                    
                    if (String.isNotBlank(choiceText)) {
                        AssessmentQuestionItem__c item = new AssessmentQuestionItem__c(
                            AssessmentQuestion__c = assessmentQuestion.Id,
                            Order__c = i + 1,
                            Content__c = choiceText
                        );
                        questionItems.add(item);
                    }
                }
                
                if (!questionItems.isEmpty()) {
                    insert questionItems;
                    itemsCreated = questionItems.size();
                    log('createAssessmentQuestion', 'Choice insert completed', itemsCreated);
                    
                    // Verify items were created successfully
                    List<AssessmentQuestionItem__c> verifyItems = [
                        SELECT Id, Content__c, Order__c 
                        FROM AssessmentQuestionItem__c 
                        WHERE AssessmentQuestion__c = :assessmentQuestion.Id
                    ];
                    
                    log('createAssessmentQuestion', 'Choice verification', verifyItems.size());
                }
            }
            
            // Return success response
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'message' => 'Question has been successfully saved.',
                'questionId' => assessmentQuestion.Id,
                'questionName' => assessmentQuestion.Name,
                'itemsCreated' => itemsCreated
            };
            
            log('createAssessmentQuestion', 'Success response prepared', response);
            return JSON.serialize(response);
            
        } catch (Exception e) {
            log('createAssessmentQuestion', 'Exception occurred', e.getMessage());
            
            // Return error response  
            Map<String, Object> response = new Map<String, Object>{
                'success' => false,
                'message' => 'An error occurred while saving: ' + e.getMessage(),
                'error' => e.getStackTraceString()
            };
            
            return JSON.serialize(response);
        }
    }
    
    /**
     * @description Get Assessment Questions for Related Question dropdown
     * @return List<AssessmentQuestion__c> - List of questions for dropdown
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestion__c> getAssessmentQuestions() {
        log('getAssessmentQuestions', 'Method started', '');
        
        try {
            List<AssessmentQuestion__c> questions = [
                SELECT Id, Name, Question__c, Type__c 
                FROM AssessmentQuestion__c 
                ORDER BY CreatedDate DESC
            ];
            
            log('getAssessmentQuestions', 'Question query completed', questions.size());
            return questions;
            
        } catch (Exception e) {
            log('getAssessmentQuestions', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving question list: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Question Items for a specific question
     * @param questionId - Assessment Question Id
     * @return List<AssessmentQuestionItem__c> - List of question items
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestionItem__c> getAssessmentQuestionItems(String questionId) {
        log('getAssessmentQuestionItems', 'Method started', questionId);
        
        try {
            if (String.isBlank(questionId)) {
                log('getAssessmentQuestionItems', 'questionId is blank', '');
                return new List<AssessmentQuestionItem__c>();
            }
            
            List<AssessmentQuestionItem__c> items = [
                SELECT Id, Order__c, Content__c 
                FROM AssessmentQuestionItem__c 
                WHERE AssessmentQuestion__c = :questionId 
                ORDER BY Order__c ASC
            ];
            
            log('getAssessmentQuestionItems', 'Question items query completed', items.size());
            return items;
            
        } catch (Exception e) {
            log('getAssessmentQuestionItems', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving question items: ' + e.getMessage());
        }
    }
}