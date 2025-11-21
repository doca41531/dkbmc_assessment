/**
 * @description Assessment Grade Controller - DKEDU (DK Lab Standards Applied)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Controllers  
 * @created date 2025-11-17
 * @last modified on 2025-11-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.0.0
 * @description Controller class for Assessment Grade operations
 *              including creation, retrieval, and grade item management
 *              following DK Lab development standards with standardized logging and error handling
 */
public with sharing class DKEDU_AssessmentGradeController {
    
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
                String logMessage = 'DKEDU_AssessmentGradeController ' + methodName + ' ' + message + ' ==>';
                if (variable != null) {
                    System.debug(logMessage + ' ' + JSON.serialize(variable));
                } else {
                    System.debug(logMessage);
                }
            } catch (Exception e) {
                System.debug('DKEDU_AssessmentGradeController ' + methodName + ' [Logging Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    // ========================================
    // WEBSERVICE METHODS  
    // ========================================
    
    /**
     * @description Create Assessment Grade with Grade Items
     * @param gradeData - JSON string containing grade and items data
     * @return String - JSON response with success/error information
     */
    @AuraEnabled
    public static String createAssessmentGrade(String gradeData) {
        log('createAssessmentGrade', 'Method started', gradeData);
        
        try {
            log('createAssessmentGrade', 'Starting data parsing', '');
            Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(gradeData);
            log('createAssessmentGrade', 'Parsing completed', data);
            
            // Extract Assessment Grade fields
            String gradeName = (String) data.get('gradeName');
            Boolean isActive = (Boolean) data.get('isActive');
            List<Object> gradeItemsData = (List<Object>) data.get('gradeItems');
            
            log('createAssessmentGrade', 'Field extraction completed', new Map<String, Object>{
                'gradeName' => gradeName,
                'isActive' => isActive,
                'gradeItemsCount' => gradeItemsData != null ? gradeItemsData.size() : 0
            });
            
            // Validate required fields
            if (String.isBlank(gradeName)) {
                log('createAssessmentGrade', 'Validation failed - grade name is blank', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'Assessment Grade Name is required.'
                });
            }
            
            if (gradeItemsData == null || gradeItemsData.isEmpty()) {
                log('createAssessmentGrade', 'Validation failed - no grade items', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'At least one grade item is required.'
                });
            }
            
            // Validate grade items and check for overlaps
            String validationError = validateGradeItems(gradeItemsData);
            if (String.isNotBlank(validationError)) {
                log('createAssessmentGrade', 'Grade items validation failed', validationError);
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => validationError
                });
            }
            
            // Create Assessment Grade
            AssessmentGrade__c assessmentGrade = new AssessmentGrade__c(
                Name = gradeName,
                IsActive__c = isActive != null ? isActive : true
            );
            
            log('createAssessmentGrade', 'Starting Assessment Grade insert', assessmentGrade);
            insert assessmentGrade;
            log('createAssessmentGrade', 'Insert completed', assessmentGrade.Id);
            
            // Verify grade was created successfully
            List<AssessmentGrade__c> verifyGrade = [
                SELECT Id, Name, IsActive__c 
                FROM AssessmentGrade__c 
                WHERE Id = :assessmentGrade.Id 
                LIMIT 1
            ];
            
            if (verifyGrade.isEmpty()) {
                log('createAssessmentGrade', 'Verification failed - grade not created', '');
                return JSON.serialize(new Map<String, Object>{
                    'success' => false,
                    'message' => 'Grade insert failed - record not found after creation'
                });
            }
            
            log('createAssessmentGrade', 'Grade verification successful', verifyGrade[0]);
            
            // Create Assessment Grade Items
            List<AssessmentGradeItem__c> gradeItems = new List<AssessmentGradeItem__c>();
            
            for (Object itemObj : gradeItemsData) {
                Map<String, Object> itemData = (Map<String, Object>) itemObj;
                
                String itemGradeName = (String) itemData.get('gradeName');
                Decimal lowestScore = itemData.get('lowestScore') != null ? 
                    Decimal.valueOf(String.valueOf(itemData.get('lowestScore'))) : null;
                Decimal highestScore = itemData.get('highestScore') != null ? 
                    Decimal.valueOf(String.valueOf(itemData.get('highestScore'))) : null;
                
                if (String.isNotBlank(itemGradeName) && lowestScore != null && highestScore != null) {
                    AssessmentGradeItem__c item = new AssessmentGradeItem__c(
                        AssessmentGrade__c = assessmentGrade.Id,
                        Name = itemGradeName,
                        LowestScore__c = lowestScore,
                        HighestScore__c = highestScore
                    );
                    gradeItems.add(item);
                }
            }
            
            Integer itemsCreated = 0;
            if (!gradeItems.isEmpty()) {
                insert gradeItems;
                itemsCreated = gradeItems.size();
                log('createAssessmentGrade', 'Grade items insert completed', itemsCreated);
                
                // Verify items were created successfully
                List<AssessmentGradeItem__c> verifyItems = [
                    SELECT Id, Name, LowestScore__c, HighestScore__c 
                    FROM AssessmentGradeItem__c 
                    WHERE AssessmentGrade__c = :assessmentGrade.Id
                ];
                
                log('createAssessmentGrade', 'Grade items verification', verifyItems.size());
            }
            
            // Return success response
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'message' => 'Assessment Grade "' + gradeName + '" has been successfully created with ' + itemsCreated + ' grade items.',
                'gradeId' => assessmentGrade.Id,
                'gradeName' => assessmentGrade.Name,
                'itemsCreated' => itemsCreated
            };
            
            log('createAssessmentGrade', 'Success response prepared', response);
            return JSON.serialize(response);
            
        } catch (Exception e) {
            log('createAssessmentGrade', 'Exception occurred', e.getMessage());
            
            // Return error response  
            Map<String, Object> response = new Map<String, Object>{
                'success' => false,
                'message' => 'An error occurred while saving Assessment Grade: ' + e.getMessage(),
                'error' => e.getStackTraceString()
            };
            
            return JSON.serialize(response);
        }
    }
    
    /**
     * @description Validate grade items data for business logic compliance
     * @param gradeItemsData - List of grade items to validate
     * @return String - Error message if validation fails, null if success
     */
    private static String validateGradeItems(List<Object> gradeItemsData) {
        log('validateGradeItems', 'Method started', gradeItemsData.size());
        
        try {
            List<Map<String, Object>> validItems = new List<Map<String, Object>>();
            
            // Validate each grade item
            for (Integer i = 0; i < gradeItemsData.size(); i++) {
                Map<String, Object> itemData = (Map<String, Object>) gradeItemsData[i];
                
                String itemGradeName = (String) itemData.get('gradeName');
                Object lowestScoreObj = itemData.get('lowestScore');
                Object highestScoreObj = itemData.get('highestScore');
                
                if (String.isBlank(itemGradeName)) {
                    return 'Grade name is required for item ' + (i + 1) + '.';
                }
                
                if (lowestScoreObj == null) {
                    return 'Lowest score is required for item ' + (i + 1) + '.';
                }
                
                if (highestScoreObj == null) {
                    return 'Highest score is required for item ' + (i + 1) + '.';
                }
                
                try {
                    Decimal lowestScore = Decimal.valueOf(String.valueOf(lowestScoreObj));
                    Decimal highestScore = Decimal.valueOf(String.valueOf(highestScoreObj));
                    
                    if (lowestScore >= highestScore) {
                        return 'Lowest score must be less than highest score for "' + itemGradeName + '".';
                    }
                    
                    // Add to valid items for overlap checking
                    validItems.add(new Map<String, Object>{
                        'gradeName' => itemGradeName,
                        'lowestScore' => lowestScore,
                        'highestScore' => highestScore
                    });
                    
                } catch (Exception numEx) {
                    return 'Invalid score format for "' + itemGradeName + '". Scores must be numeric values.';
                }
            }
            
            // Check for overlapping ranges
            if (validItems.size() > 1) {
                // Sort by lowest score
                validItems.sort(new GradeItemComparator());
                
                for (Integer i = 0; i < validItems.size() - 1; i++) {
                    Decimal currentHigh = (Decimal) validItems[i].get('highestScore');
                    Decimal nextLow = (Decimal) validItems[i + 1].get('lowestScore');
                    
                    if (currentHigh > nextLow) {
                        String currentName = (String) validItems[i].get('gradeName');
                        String nextName = (String) validItems[i + 1].get('gradeName');
                        return 'Score ranges overlap between "' + currentName + '" (' + 
                               validItems[i].get('lowestScore') + '-' + currentHigh + ') and "' + 
                               nextName + '" (' + nextLow + '-' + validItems[i + 1].get('highestScore') + ').';
                    }
                }
            }
            
            log('validateGradeItems', 'Validation completed successfully', validItems.size());
            return null; // No errors
            
        } catch (Exception e) {
            log('validateGradeItems', 'Exception during validation', e.getMessage());
            return 'Validation error: ' + e.getMessage();
        }
    }
    
    /**
     * @description Get Assessment Grades for dropdown/lookup
     * @return List<AssessmentGrade__c> - List of grades
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentGrade__c> getAssessmentGrades() {
        log('getAssessmentGrades', 'Method started', '');
        
        try {
            List<AssessmentGrade__c> grades = [
                SELECT Id, Name, IsActive__c 
                FROM AssessmentGrade__c 
                WHERE IsActive__c = true
                ORDER BY CreatedDate DESC
            ];
            
            log('getAssessmentGrades', 'Grade query completed', grades.size());
            return grades;
            
        } catch (Exception e) {
            log('getAssessmentGrades', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving grade list: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Grade Items for a specific grade
     * @param gradeId - Assessment Grade Id
     * @return List<AssessmentGradeItem__c> - List of grade items
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentGradeItem__c> getAssessmentGradeItems(String gradeId) {
        log('getAssessmentGradeItems', 'Method started', gradeId);
        
        try {
            if (String.isBlank(gradeId)) {
                log('getAssessmentGradeItems', 'gradeId is blank', '');
                return new List<AssessmentGradeItem__c>();
            }
            
            List<AssessmentGradeItem__c> items = [
                SELECT Id, Name, LowestScore__c, HighestScore__c 
                FROM AssessmentGradeItem__c 
                WHERE AssessmentGrade__c = :gradeId 
                ORDER BY LowestScore__c ASC
            ];
            
            log('getAssessmentGradeItems', 'Grade items query completed', items.size());
            return items;
            
        } catch (Exception e) {
            log('getAssessmentGradeItems', 'Exception occurred', e.getMessage());
            throw new AuraHandledException('An error occurred while retrieving grade items: ' + e.getMessage());
        }
    }
    
    // ========================================
    // HELPER CLASSES
    // ========================================
    
    /**
     * @description Comparator for sorting grade items by lowest score
     */
    public class GradeItemComparator implements Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            Decimal scoreA = (Decimal) a.get('lowestScore');
            Decimal scoreB = (Decimal) b.get('lowestScore');
            
            if (scoreA < scoreB) return -1;
            if (scoreA > scoreB) return 1;
            return 0;
        }
    }
}