/**
 * @description Assessment Preview Controller - DKEDU (Fixed Version)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Controllers
 * @created date 2025-10-17
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.2.0
 */
public with sharing class DKEDU_AssessmentPreviewController {
    
    private static final Boolean DEBUG = false;
    
    private static void log(String methodName, String message, Object variable) {
        if (DEBUG) {
            try {
                String logMessage = 'DKEDU_AssessmentPreviewController ' + methodName + ' ' + message + ' ==>';
                if (variable != null) {
                    System.debug(logMessage + ' ' + JSON.serialize(variable));
                } else {
                    System.debug(logMessage);
                }
            } catch (Exception e) {
                System.debug('DKEDU_AssessmentPreviewController ' + methodName + ' [Logging Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static AssessmentPreviewWrapper getAssessmentPreviewData(Id templateId) {
        log('getAssessmentPreviewData', 'Method started', templateId);
        
        try {
            if (String.isBlank(templateId)) {
                log('getAssessmentPreviewData', 'Template ID is blank', '');
                throw new AuraHandledException('Template ID is required');
            }
            
            AssessmentPreviewWrapper wrapper = new AssessmentPreviewWrapper();
            
            // Assessment Template 기본 정보 조회
            List<AssessmentTemplate__c> templateList = [
                SELECT Id, Name, Description__c
                FROM AssessmentTemplate__c 
                WHERE Id = :templateId
                LIMIT 1
            ];
            
            if (templateList.isEmpty()) {
                log('getAssessmentPreviewData', 'Assessment Template not found', templateId);
                throw new AuraHandledException('Assessment Template not found');
            }
            
            TemplateWrapper templateWrapper = new TemplateWrapper();
            templateWrapper.Id = templateList[0].Id;
            templateWrapper.Name = templateList[0].Name;
            templateWrapper.Description = templateList[0].Description__c;
            log('getAssessmentPreviewData', 'Template basic info retrieved', templateWrapper);
            
            // Template의 Sections 조회
            List<AssessmentTemplateSection__c> sectionList = [
                SELECT Id, Name, Score__c, Order__c
                FROM AssessmentTemplateSection__c
                WHERE AssessmentTemplate__c = :templateId
                ORDER BY Order__c NULLS LAST, CreatedDate
            ];
            log('getAssessmentPreviewData', 'Sections retrieved', sectionList.size());
            
            // Section별로 Questions 조회
            Map<Id, List<AssessmentTemplateQuestion__c>> sectionQuestionsMap = new Map<Id, List<AssessmentTemplateQuestion__c>>();
            Map<Id, List<AssessmentTemplateQuestionItem__c>> questionItemsMap = new Map<Id, List<AssessmentTemplateQuestionItem__c>>();
            Map<Id, AssessmentQuestion__c> assessmentQuestionsMap = new Map<Id, AssessmentQuestion__c>();
            
            if (!sectionList.isEmpty()) {
                Set<Id> sectionIds = new Set<Id>();
                for (AssessmentTemplateSection__c section : sectionList) {
                    sectionIds.add(section.Id);
                }
                
                // Template Questions 조회 (AssessmentQuestionId__c 필드 포함)
                List<AssessmentTemplateQuestion__c> questionList = [
                    SELECT Id, Question__c, Type__c, Score__c, Order__c, AssessmentTemplateGroup__c,
                           AssessmentQuestionId__c
                    FROM AssessmentTemplateQuestion__c
                    WHERE AssessmentTemplateGroup__c IN :sectionIds
                    ORDER BY Order__c NULLS LAST, CreatedDate
                ];
                log('getAssessmentPreviewData', 'Template Questions retrieved', questionList.size());
                
                // 연결된 Assessment Questions 조회 (Related Question 정보 포함)
                Set<Id> assessmentQuestionIds = new Set<Id>();
                for (AssessmentTemplateQuestion__c tq : questionList) {
                    if (tq.AssessmentQuestionId__c != null) {
                        assessmentQuestionIds.add(tq.AssessmentQuestionId__c);
                    }
                }
                
                if (!assessmentQuestionIds.isEmpty()) {
                    List<AssessmentQuestion__c> assessmentQuestions = [
                        SELECT Id, Question__c, RelatedQuestionId__c, RelatedCriteria__c,
                               RelatedQuestionId__r.Question__c
                        FROM AssessmentQuestion__c
                        WHERE Id IN :assessmentQuestionIds
                    ];
                    
                    for (AssessmentQuestion__c aq : assessmentQuestions) {
                        assessmentQuestionsMap.put(aq.Id, aq);
                    }
                    log('getAssessmentPreviewData', 'Assessment Questions with related info retrieved', assessmentQuestions.size());
                }
                
                // Question별로 Question Items 조회
                Set<Id> questionIds = new Set<Id>();
                for (AssessmentTemplateQuestion__c question : questionList) {
                    questionIds.add(question.Id);
                }
                
                if (!questionIds.isEmpty()) {
                    List<AssessmentTemplateQuestionItem__c> questionItemList = [
                        SELECT Id, Content__c, Score__c, Order__c, AssessmentTemplateQuestion__c
                        FROM AssessmentTemplateQuestionItem__c
                        WHERE AssessmentTemplateQuestion__c IN :questionIds
                        ORDER BY Order__c NULLS LAST, CreatedDate
                    ];
                    log('getAssessmentPreviewData', 'Question items retrieved', questionItemList.size());
                    
                    for (AssessmentTemplateQuestionItem__c item : questionItemList) {
                        if (!questionItemsMap.containsKey(item.AssessmentTemplateQuestion__c)) {
                            questionItemsMap.put(item.AssessmentTemplateQuestion__c, new List<AssessmentTemplateQuestionItem__c>());
                        }
                        questionItemsMap.get(item.AssessmentTemplateQuestion__c).add(item);
                    }
                }
                
                // Section별로 Question들 그룹화
                for (AssessmentTemplateQuestion__c question : questionList) {
                    if (!sectionQuestionsMap.containsKey(question.AssessmentTemplateGroup__c)) {
                        sectionQuestionsMap.put(question.AssessmentTemplateGroup__c, new List<AssessmentTemplateQuestion__c>());
                    }
                    sectionQuestionsMap.get(question.AssessmentTemplateGroup__c).add(question);
                }
            }
            
            // 데이터 변환 및 추가 처리
            List<SectionWrapper> sectionWrappers = new List<SectionWrapper>();
            
            for (AssessmentTemplateSection__c sectionRecord : sectionList) {
                SectionWrapper sectionWrapper = new SectionWrapper();
                sectionWrapper.Id = sectionRecord.Id;
                sectionWrapper.Name = sectionRecord.Name;
                sectionWrapper.SectionScore = sectionRecord.Score__c;
                sectionWrapper.Questions = new List<QuestionWrapper>();
                
                // 해당 Section의 Questions 가져오기
                List<AssessmentTemplateQuestion__c> sectionQuestions = sectionQuestionsMap.get(sectionRecord.Id);
                if (sectionQuestions != null) {
                    for (AssessmentTemplateQuestion__c questionRecord : sectionQuestions) {
                        QuestionWrapper questionWrapper = new QuestionWrapper();
                        questionWrapper.Id = questionRecord.Id;
                        questionWrapper.QuestionText = questionRecord.Question__c;
                        questionWrapper.QuestionType = questionRecord.Type__c;
                        questionWrapper.QuestionScore = questionRecord.Score__c;
                        
                        // Related Question 정보 처리
                        if (questionRecord.AssessmentQuestionId__c != null) {
                            AssessmentQuestion__c relatedAQ = assessmentQuestionsMap.get(questionRecord.AssessmentQuestionId__c);
                            if (relatedAQ != null && relatedAQ.RelatedQuestionId__c != null) {
                                questionWrapper.isRelatedQuestion = true;
                                questionWrapper.relatedCriteria = relatedAQ.RelatedCriteria__c;
                                questionWrapper.parentQuestionText = relatedAQ.RelatedQuestionId__r.Question__c;
                            }
                        }
                        
                        // Question type labels - 수정된 부분
                        questionWrapper.questionTypeLabel = getQuestionTypeLabel(questionRecord.Type__c);
                        
                        // Question type flags - 수정된 부분
                        questionWrapper.isChoosable = (questionRecord.Type__c == 'Choosable' || questionRecord.Type__c == 'Multi Choosable');
                        questionWrapper.isStarRating = (questionRecord.Type__c == 'Star Rating');
                        questionWrapper.isShortAnswer = (questionRecord.Type__c == 'Short Answer');
                        questionWrapper.isNumberPoint = (questionRecord.Type__c == 'Number Point');
                        
                        // Star array for star rating
                        if (questionWrapper.isStarRating) {
                            questionWrapper.starArray = new List<Map<String, Object>>();
                            for (Integer i = 0; i < 5; i++) {
                                questionWrapper.starArray.add(new Map<String, Object>{
                                    'id' => i,
                                    'symbol' => '☆'
                                });
                            }
                        }
                        
                        // Question Items
                        List<AssessmentTemplateQuestionItem__c> questionItems = questionItemsMap.get(questionRecord.Id);
                        if (questionItems != null && !questionItems.isEmpty()) {
                            questionWrapper.QuestionItems = new List<QuestionItemWrapper>();
                            for (AssessmentTemplateQuestionItem__c itemRecord : questionItems) {
                                QuestionItemWrapper itemWrapper = new QuestionItemWrapper();
                                itemWrapper.Id = itemRecord.Id;
                                itemWrapper.ContentText = itemRecord.Content__c;
                                itemWrapper.ItemScore = itemRecord.Score__c;
                                questionWrapper.QuestionItems.add(itemWrapper);
                            }
                        }
                        
                        sectionWrapper.Questions.add(questionWrapper);
                    }
                }
                
                sectionWrappers.add(sectionWrapper);
            }
            
            wrapper.template = templateWrapper;
            wrapper.sections = sectionWrappers;
            
            log('getAssessmentPreviewData', 'Preview data prepared successfully', wrapper);
            return wrapper;
            
        } catch (Exception e) {
            log('getAssessmentPreviewData', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('Error retrieving assessment data: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get localized question type label - 수정된 버전
     */
    private static String getQuestionTypeLabel(String type) {
        try {
            Map<String, String> typeMap = new Map<String, String>{
                'Choosable' => 'Single Choice',
                'Multi Choosable' => 'Multiple Choice',  // 공백 포함으로 수정
                'Star Rating' => 'Star Rating',          // 공백 포함으로 수정
                'Short Answer' => 'Short Answer',        // 공백 포함으로 수정
                'Number Point' => 'Number Input'         // 공백 포함으로 수정
            };
            
            return typeMap.containsKey(type) ? typeMap.get(type) : type;
        } catch (Exception e) {
            log('getQuestionTypeLabel', 'Exception occurred', e.getMessage());
            return type != null ? type : 'Unknown';
        }
    }
    
    // ========================================
    // WRAPPER CLASSES
    // ========================================
    
    public class AssessmentPreviewWrapper {
        @AuraEnabled public TemplateWrapper template;
        @AuraEnabled public List<SectionWrapper> sections;
        
        public AssessmentPreviewWrapper() {
            this.sections = new List<SectionWrapper>();
        }
    }
    
    public class TemplateWrapper {
        @AuraEnabled public Id Id;
        @AuraEnabled public String Name;
        @AuraEnabled public String Description;
    }
    
    public class SectionWrapper {
        @AuraEnabled public Id Id;
        @AuraEnabled public String Name;
        @AuraEnabled public Decimal SectionScore;
        @AuraEnabled public List<QuestionWrapper> Questions;
        
        public SectionWrapper() {
            this.Questions = new List<QuestionWrapper>();
        }
    }
    
    public class QuestionWrapper {
        @AuraEnabled public Id Id;
        @AuraEnabled public String QuestionText;
        @AuraEnabled public String QuestionType;
        @AuraEnabled public Decimal QuestionScore;
        @AuraEnabled public String questionTypeLabel;
        @AuraEnabled public Boolean isChoosable;
        @AuraEnabled public Boolean isStarRating;
        @AuraEnabled public Boolean isShortAnswer;
        @AuraEnabled public Boolean isNumberPoint;
        @AuraEnabled public List<Map<String, Object>> starArray;
        @AuraEnabled public List<QuestionItemWrapper> QuestionItems;
        
        // Related Question 관련 필드 추가
        @AuraEnabled public Boolean isRelatedQuestion;
        @AuraEnabled public String relatedCriteria;
        @AuraEnabled public String parentQuestionText;
        
        public QuestionWrapper() {
            this.isChoosable = false;
            this.isStarRating = false;
            this.isShortAnswer = false;
            this.isNumberPoint = false;
            this.isRelatedQuestion = false;
            this.QuestionItems = new List<QuestionItemWrapper>();
        }
    }
    
    public class QuestionItemWrapper {
        @AuraEnabled public Id Id;
        @AuraEnabled public String ContentText;
        @AuraEnabled public Decimal ItemScore;
    }
}