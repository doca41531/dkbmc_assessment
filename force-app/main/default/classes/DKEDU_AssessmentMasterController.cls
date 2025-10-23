/**
 * @description       : Assessment Master Controller - DKEDU (DK Lab Standards Compliant)
 * @author            : developer@company.com
 * @group             : DKEDU Controllers
 * @created date      : 2025-01-15
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 2.0.0
 */
public with sharing class DKEDU_AssessmentMasterController {
    
    // Debug switch following DK Lab standards
    public static final Boolean DEBUG = true;
    
    // Constants following UPPERCASE naming convention
    private static final Integer QUERY_LIMIT = 1000;
    private static final Integer SEARCH_LIMIT = 50;
    private static final String STATUS_WAITING = 'Waiting';
    private static final String ASSIGN_TYPE_MANUAL = 'Manual';
    
    /**
     * @description Get active Assessment Templates
     * @return List of Assessment Templates
     * @throws AuraHandledException when retrieval fails
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentTemplate__c> getAssessmentTemplates() {
        try {
            DKEDU_DebugUtils.log('getAssessmentTemplates - Start');
            
            List<AssessmentTemplate__c> templates = [
                SELECT Id, Name, Description__c, IsActive__c
                FROM AssessmentTemplate__c 
                WHERE IsActive__c = true
                ORDER BY Name ASC
                LIMIT :QUERY_LIMIT
            ];
            
            DKEDU_DebugUtils.log('getAssessmentTemplates - Success', templates.size());
            return templates;
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('getAssessmentTemplates - Exception', e);
            throw new AuraHandledException('Failed to retrieve assessment templates: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get active Assessment Grades
     * @return List of Assessment Grades
     * @throws AuraHandledException when retrieval fails
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentGrade__c> getAssessmentGrades() {
        try {
            DKEDU_DebugUtils.log('getAssessmentGrades - Start');
            
            List<AssessmentGrade__c> grades = [
                SELECT Id, Name, IsActive__c
                FROM AssessmentGrade__c 
                WHERE IsActive__c = true
                ORDER BY Name ASC
                LIMIT :QUERY_LIMIT
            ];
            
            DKEDU_DebugUtils.log('getAssessmentGrades - Success', grades.size());
            return grades;
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('getAssessmentGrades - Exception', e);
            throw new AuraHandledException('Failed to retrieve assessment grades: ' + e.getMessage());
        }
    }
    
    /**
     * @description Search Contacts for assessment targets
     * @param searchTerm Search term for contact name (minimum 1 character)
     * @return List of Contacts matching search criteria
     * @throws AuraHandledException when search fails
     */
    @AuraEnabled
    public static List<Contact> searchContacts(String searchTerm) {
        try {
            DKEDU_DebugUtils.log('searchContacts - Start', searchTerm);
            
            // Validate input parameters
            if (String.isBlank(searchTerm) || searchTerm.length() < 1) {
                DKEDU_DebugUtils.log('searchContacts - Invalid search term');
                return new List<Contact>();
            }
            
            String cleanSearchTerm = String.escapeSingleQuotes(searchTerm.trim());
            String searchPattern = '%' + cleanSearchTerm + '%';
            
            List<Contact> results = [
                SELECT Id, Name, Email, Phone, Account.Name, AccountId
                FROM Contact 
                WHERE Name LIKE :searchPattern
                ORDER BY Name ASC
                LIMIT :SEARCH_LIMIT
            ];
            
            DKEDU_DebugUtils.log('searchContacts - Success', results.size());
            return results;
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('searchContacts - Exception', e);
            throw new AuraHandledException('Failed to search contacts: ' + e.getMessage());
        }
    }
    
    /**
     * @description Create new Assessment Master with comprehensive validation
     * @param masterData JSON string containing master information
     * @return JSON string with success/error information and masterId
     * @throws AuraHandledException when creation fails
     */
    @AuraEnabled
    public static String createAssessmentMaster(String masterData) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            DKEDU_DebugUtils.log('createAssessmentMaster - Start', masterData);
            
            // Parse and validate master data
            Map<String, Object> masterMap = parseAndValidateMasterData(masterData);
            
            // Create Assessment Master record
            AssessmentMaster__c master = buildAssessmentMaster(masterMap);
            
            // Insert master record
            Database.insert(master);
            DKEDU_DebugUtils.log('createAssessmentMaster - Master created', master.Id);
            
            // Create targets if Manual assign type
            createTargetsIfRequired(master.Id, masterMap);
            
            // Build success response
            Map<String, Object> result = new Map<String, Object>{
                'success' => true,
                'message' => 'Assessment Master created successfully',
                'masterId' => master.Id
            };
            
            DKEDU_DebugUtils.log('createAssessmentMaster - Success', result);
            return JSON.serialize(result);
            
        } catch (DmlException e) {
            Database.rollback(sp);
            return handleDmlException(e);
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            return handleAuraException(e);
        } catch (Exception e) {
            Database.rollback(sp);
            return handleGeneralException(e);
        }
    }
    
    /**
     * @description Parse and validate master data JSON
     * @param masterData Raw JSON string
     * @return Parsed and validated master data map
     * @throws AuraHandledException when parsing or validation fails
     */
    private static Map<String, Object> parseAndValidateMasterData(String masterData) {
        try {
            Map<String, Object> masterMap = (Map<String, Object>) JSON.deserializeUntyped(masterData);
            validateMasterData(masterMap);
            return masterMap;
        } catch (JSONException e) {
            DKEDU_DebugUtils.log('parseAndValidateMasterData - JSON Parse Error', e);
            throw new AuraHandledException('Failed to parse master data: ' + e.getMessage());
        }
    }
    
    /**
     * @description Build Assessment Master record from validated data
     * @param masterMap Validated master data map
     * @return Configured AssessmentMaster__c record
     */
    private static AssessmentMaster__c buildAssessmentMaster(Map<String, Object> masterMap) {
        AssessmentMaster__c master = new AssessmentMaster__c();
        
        // Set basic fields
        master.Name = (String) masterMap.get('masterName');
        master.IsActive__c = (Boolean) masterMap.get('isActive');
        master.AssessmentStartDate__c = Date.valueOf((String) masterMap.get('startDate'));
        master.AssessmentEndDate__c = Date.valueOf((String) masterMap.get('endDate'));
        
        // Set lookup fields
        master.AssessmentTemplateId__c = (String) masterMap.get('assessmentTemplateId');
        master.GradeId__c = (String) masterMap.get('assessmentGradeId');
        
        // Set picklist fields
        master.AssessmentType__c = (String) masterMap.get('assessmentType');
        master.AssignType__c = (String) masterMap.get('assignType');
        
        // Set optional fields
        String description = (String) masterMap.get('description');
        if (!String.isBlank(description)) {
            master.Description__c = description;
        }
        
        // Set initial status
        master.Status__c = STATUS_WAITING;
        
        DKEDU_DebugUtils.log('buildAssessmentMaster - Master built', master);
        return master;
    }
    
    /**
     * @description Create assessment targets if assign type is Manual
     * @param masterId Assessment Master ID
     * @param masterMap Master data containing targets
     */
    private static void createTargetsIfRequired(Id masterId, Map<String, Object> masterMap) {
        String assignType = (String) masterMap.get('assignType');
        
        if (ASSIGN_TYPE_MANUAL.equals(assignType)) {
            List<Object> targets = (List<Object>) masterMap.get('targets');
            if (targets != null && !targets.isEmpty()) {
                createAssessmentTargets(masterId, targets);
            }
        }
    }
    
    /**
     * @description Validate master data before processing
     * @param masterMap Parsed master data map
     * @throws AuraHandledException when validation fails
     */
    private static void validateMasterData(Map<String, Object> masterMap) {
        List<String> errors = new List<String>();
        
        // Required field validation
        validateRequiredField(masterMap, 'masterName', 'Master Name', errors);
        validateRequiredField(masterMap, 'startDate', 'Start Date', errors);
        validateRequiredField(masterMap, 'endDate', 'End Date', errors);
        validateRequiredField(masterMap, 'assessmentTemplateId', 'Assessment Template', errors);
        validateRequiredField(masterMap, 'assessmentGradeId', 'Assessment Grade', errors);
        validateRequiredField(masterMap, 'assessmentType', 'Assessment Type', errors);
        validateRequiredField(masterMap, 'assignType', 'Assign Type', errors);
        
        // Date range validation
        validateDateRange(masterMap, errors);
        
        // Manual assign type validation
        validateManualAssignTargets(masterMap, errors);
        
        if (!errors.isEmpty()) {
            String errorMessage = 'Validation errors: ' + String.join(errors, ', ');
            DKEDU_DebugUtils.log('validateMasterData - Validation failed', errorMessage);
            throw new AuraHandledException(errorMessage);
        }
    }
    
    /**
     * @description Validate required field presence
     * @param masterMap Data map to validate
     * @param fieldKey Field key to check
     * @param fieldLabel User-friendly field name
     * @param errors Error list to append to
     */
    private static void validateRequiredField(Map<String, Object> masterMap, String fieldKey, String fieldLabel, List<String> errors) {
        if (String.isBlank((String) masterMap.get(fieldKey))) {
            errors.add(fieldLabel + ' is required');
        }
    }
    
    /**
     * @description Validate date range logic
     * @param masterMap Data map containing dates
     * @param errors Error list to append to
     */
    private static void validateDateRange(Map<String, Object> masterMap, List<String> errors) {
        String startDateStr = (String) masterMap.get('startDate');
        String endDateStr = (String) masterMap.get('endDate');
        
        if (!String.isBlank(startDateStr) && !String.isBlank(endDateStr)) {
            try {
                Date startDate = Date.valueOf(startDateStr);
                Date endDate = Date.valueOf(endDateStr);
                
                if (startDate > endDate) {
                    errors.add('Start Date cannot be later than End Date');
                }
            } catch (Exception dateError) {
                errors.add('Invalid date format');
                DKEDU_DebugUtils.log('validateDateRange - Date parsing error', dateError);
            }
        }
    }
    
    /**
     * @description Validate Manual assign type targets
     * @param masterMap Data map containing assign type and targets
     * @param errors Error list to append to
     */
    private static void validateManualAssignTargets(Map<String, Object> masterMap, List<String> errors) {
        String assignType = (String) masterMap.get('assignType');
        
        if (ASSIGN_TYPE_MANUAL.equals(assignType)) {
            List<Object> targets = (List<Object>) masterMap.get('targets');
            if (targets == null || targets.isEmpty()) {
                errors.add('Assessment Target is required when Assign Type is Manual');
            }
        }
    }
    
    /**
     * @description Create Assessment Target records
     * @param masterId Assessment Master ID
     * @param targets List of target data
     * @throws AuraHandledException when target creation fails
     */
    private static void createAssessmentTargets(Id masterId, List<Object> targets) {
        try {
            DKEDU_DebugUtils.log('createAssessmentTargets - Start', targets.size());
            
            List<AssessmentTarget__c> targetsToInsert = new List<AssessmentTarget__c>();
            
            for (Object targetObj : targets) {
                Map<String, Object> targetMap = (Map<String, Object>) targetObj;
                
                AssessmentTarget__c target = new AssessmentTarget__c();
                target.AssessmentMaster__c = masterId;
                
                String contactId = (String) targetMap.get('contactId');
                if (!String.isBlank(contactId)) {
                    target.ContactId__c = contactId;
                }
                
                targetsToInsert.add(target);
            }
            
            if (!targetsToInsert.isEmpty()) {
                Database.insert(targetsToInsert);
                DKEDU_DebugUtils.log('createAssessmentTargets - Success', targetsToInsert.size());
            }
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('createAssessmentTargets - Exception', e);
            throw new AuraHandledException('Failed to create assessment targets: ' + e.getMessage());
        }
    }
    
    /**
     * @description Handle DML exceptions with detailed error information
     * @param e DML exception to handle
     * @return JSON error response
     */
    private static String handleDmlException(DmlException e) {
        DKEDU_DebugUtils.log('handleDmlException', e);
        
        String errorMsg = 'Database error: ';
        if (e.getNumDml() > 0) {
            errorMsg += e.getDmlMessage(0);
        } else {
            errorMsg += e.getMessage();
        }
        
        Map<String, Object> result = new Map<String, Object>{
            'success' => false,
            'message' => errorMsg,
            'errorType' => 'DmlException'
        };
        
        return JSON.serialize(result);
    }
    
    /**
     * @description Handle Aura handled exceptions
     * @param e Aura handled exception to handle
     * @return JSON error response
     */
    private static String handleAuraException(AuraHandledException e) {
        DKEDU_DebugUtils.log('handleAuraException', e);
        
        Map<String, Object> result = new Map<String, Object>{
            'success' => false,
            'message' => e.getMessage(),
            'errorType' => 'AuraHandledException'
        };
        
        return JSON.serialize(result);
    }
    
    /**
     * @description Handle general exceptions
     * @param e General exception to handle
     * @return JSON error response
     */
    private static String handleGeneralException(Exception e) {
        DKEDU_DebugUtils.log('handleGeneralException', e);
        
        Map<String, Object> result = new Map<String, Object>{
            'success' => false,
            'message' => 'Unexpected error: ' + e.getMessage(),
            'errorType' => 'GeneralException',
            'errorTypeName' => e.getTypeName()
        };
        
        return JSON.serialize(result);
    }
    
    /**
     * @description Get Assessment Master details by ID
     * @param masterId Assessment Master ID
     * @return Assessment Master with related data
     * @throws AuraHandledException when retrieval fails
     */
    @AuraEnabled(cacheable=true)
    public static AssessmentMaster__c getAssessmentMasterDetails(Id masterId) {
        try {
            DKEDU_DebugUtils.log('getAssessmentMasterDetails - Start', masterId);
            
            AssessmentMaster__c master = [
                SELECT Id, Name, IsActive__c, AssessmentStartDate__c, AssessmentEndDate__c,
                       AssessmentTemplateId__c, AssessmentTemplateId__r.Name,
                       GradeId__c, GradeId__r.Name,
                       AssessmentType__c, AssignType__c, Description__c, Status__c,
                       CreatedDate, LastModifiedDate
                FROM AssessmentMaster__c 
                WHERE Id = :masterId 
                LIMIT 1
            ];
            
            DKEDU_DebugUtils.log('getAssessmentMasterDetails - Success', master);
            return master;
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('getAssessmentMasterDetails - Exception', e);
            throw new AuraHandledException('Failed to retrieve assessment master details: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Targets for a Master
     * @param masterId Assessment Master ID
     * @return List of Assessment Targets
     * @throws AuraHandledException when retrieval fails
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentTarget__c> getAssessmentTargets(Id masterId) {
        try {
            DKEDU_DebugUtils.log('getAssessmentTargets - Start', masterId);
            
            List<AssessmentTarget__c> targets = [
                SELECT Id, AssessmentMaster__c, ContactId__c
                FROM AssessmentTarget__c 
                WHERE AssessmentMaster__c = :masterId
                ORDER BY CreatedDate ASC
                LIMIT :QUERY_LIMIT
            ];
            
            DKEDU_DebugUtils.log('getAssessmentTargets - Success', targets.size());
            return targets;
            
        } catch (Exception e) {
            DKEDU_DebugUtils.log('getAssessmentTargets - Exception', e);
            throw new AuraHandledException('Failed to retrieve assessment targets: ' + e.getMessage());
        }
    }
}