/**
 * @description       : Assessment Question Controller - DKEDU
 * @author            : mingyu.park@dkbmc.com
 * @group             : DKEDU Controllers
 * @created date      : 2025-09-25
 * @last modified on  : 2025-10-14
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 1.1.0
 * @description       : Controller class for Assessment Question operations
 *                      including creation, retrieval, and item management
 *                      following DK Lab development standards with standardized logging and error handling
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
     * @param {String} msg - Message to log
     * @param {Object} variable - Variable to log (optional)
     */
    private static void log(String methodName, String msg, Object variable) {
        if (DEBUG) {
            String logMessage = 'DKEDU_AssessmentQuestionController ' + methodName + ' ' + msg + ' ==>';
            if (variable != null) {
                System.debug(logMessage + ' ' + String.valueOf(variable));
            } else {
                System.debug(logMessage);
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
        log('createAssessmentQuestion', '메서드 시작', questionData);
        
        try {
            log('createAssessmentQuestion', '데이터 파싱 시작', '');
            Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(questionData);
            log('createAssessmentQuestion', '파싱 완료', data);
            
            // Extract Assessment Question fields
            String questionType = (String) data.get('questionType');
            String questionText = (String) data.get('questionText');
            Boolean hasRelatedQuestion = (Boolean) data.get('hasRelatedQuestion');
            String relatedQuestionId = (String) data.get('relatedQuestionId');
            String relatedCriteria = (String) data.get('relatedCriteria');
            Boolean fileIncluded = (Boolean) data.get('fileIncluded');
            
            log('createAssessmentQuestion', '필드 추출 완료', new Map<String, Object>{
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
                log('createAssessmentQuestion', '관련 질문 설정', relatedQuestionId);
            }
            
            log('createAssessmentQuestion', 'Assessment Question 삽입 시작', assessmentQuestion);
            insert assessmentQuestion;
            log('createAssessmentQuestion', '삽입 완료', assessmentQuestion.Id);
            
            // Verify question was created successfully
            List<AssessmentQuestion__c> verifyQuestion = [
                SELECT Id, Name, Type__c, Question__c 
                FROM AssessmentQuestion__c 
                WHERE Id = :assessmentQuestion.Id 
                LIMIT 1
            ];
            
            if (verifyQuestion.isEmpty()) {
                log('createAssessmentQuestion', '검증 실패 - 질문이 생성되지 않음', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'Question insert failed - record not found after creation'
                });
            }
            
            log('createAssessmentQuestion', '질문 검증 성공', verifyQuestion[0]);
            
            // Create Assessment Question Items (choices) if they exist
            List<Object> choiceItems = (List<Object>) data.get('choices');
            Integer itemsCreated = 0;
            
            if (choiceItems != null && !choiceItems.isEmpty()) {
                log('createAssessmentQuestion', '선택지 생성 시작', choiceItems.size());
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
                    log('createAssessmentQuestion', '선택지 삽입 완료', itemsCreated);
                    
                    // Verify items were created successfully
                    List<AssessmentQuestionItem__c> verifyItems = [
                        SELECT Id, Content__c, Order__c 
                        FROM AssessmentQuestionItem__c 
                        WHERE AssessmentQuestion__c = :assessmentQuestion.Id
                    ];
                    
                    log('createAssessmentQuestion', '선택지 검증', verifyItems.size());
                }
            }
            
            // Return success response
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'message' => '질문이 성공적으로 저장되었습니다.',
                'questionId' => assessmentQuestion.Id,
                'questionName' => assessmentQuestion.Name,
                'itemsCreated' => itemsCreated
            };
            
            log('createAssessmentQuestion', '성공 응답 준비 완료', response);
            return JSON.serialize(response);
            
        } catch (Exception e) {
            log('createAssessmentQuestion', '예외 발생', e.getMessage());
            
            // Return error response  
            Map<String, Object> response = new Map<String, Object>{
                'success' => false,
                'message' => '저장 중 오류가 발생했습니다: ' + e.getMessage(),
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
        log('getAssessmentQuestions', '메서드 시작', '');
        
        try {
            List<AssessmentQuestion__c> questions = [
                SELECT Id, Name, Question__c, Type__c 
                FROM AssessmentQuestion__c 
                ORDER BY CreatedDate DESC 
                LIMIT 100
            ];
            
            log('getAssessmentQuestions', '질문 조회 완료', questions.size());
            return questions;
            
        } catch (Exception e) {
            log('getAssessmentQuestions', '예외 발생', e.getMessage());
            throw new AuraHandledException('질문 목록을 가져오는 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Question Items for a specific question
     * @param questionId - Assessment Question Id
    * @return List<AssessmentQuestionItem__c> - List of question items
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentQuestionItem__c> getAssessmentQuestionItems(String questionId) {
        log('getAssessmentQuestionItems', '메서드 시작', questionId);
        
        try {
            if (String.isBlank(questionId)) {
                log('getAssessmentQuestionItems', 'questionId가 비어있음', '');
                return new List<AssessmentQuestionItem__c>();
            }
            
            List<AssessmentQuestionItem__c> items = [
                SELECT Id, Order__c, Content__c 
                FROM AssessmentQuestionItem__c 
                WHERE AssessmentQuestion__c = :questionId 
                ORDER BY Order__c ASC
            ];
            
            log('getAssessmentQuestionItems', '질문 항목 조회 완료', items.size());
            return items;
            
        } catch (Exception e) {
            log('getAssessmentQuestionItems', '예외 발생', e.getMessage());
            throw new AuraHandledException('질문 항목을 가져오는 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
}