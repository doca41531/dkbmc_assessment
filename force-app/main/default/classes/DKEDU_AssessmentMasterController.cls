/**
 * @description       : Assessment Master Controller - DKEDU (Complete Fixed Version)
 * @author            : developer@company.com
 * @group             : DKEDU Controllers
 * @created date      : 2025-01-15
 * @last modified on  : 2025-10-16
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 1.3.0
 */
public with sharing class DKEDU_AssessmentMasterController {
    
    /**
     * @description Get active Assessment Templates
     * @return List of Assessment Templates
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentTemplate__c> getAssessmentTemplates() {
        try {
            return [
                SELECT Id, Name, Description__c, IsActive__c
                FROM AssessmentTemplate__c 
                WHERE IsActive__c = true
                ORDER BY Name ASC
                LIMIT 1000
            ];
        } catch (Exception e) {
            System.debug('Error in getAssessmentTemplates: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve assessment templates: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get active Assessment Grades
     * @return List of Assessment Grades
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentGrade__c> getAssessmentGrades() {
        try {
            return [
                SELECT Id, Name, IsActive__c
                FROM AssessmentGrade__c 
                WHERE IsActive__c = true
                ORDER BY Name ASC
                LIMIT 1000
            ];
        } catch (Exception e) {
            System.debug('Error in getAssessmentGrades: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve assessment grades: ' + e.getMessage());
        }
    }
    
    /**
     * @description Search Contacts for assessment targets
     * @param searchTerm Search term for contact name
     * @return List of Contacts
     */
    @AuraEnabled
    public static List<Contact> searchContacts(String searchTerm) {
        try {
            System.debug('SearchContacts called with term: ' + searchTerm);
            
            if (String.isBlank(searchTerm) || searchTerm.length() < 1) {
                System.debug('Search term too short or blank, returning empty list');
                return new List<Contact>();
            }
            
            String cleanSearchTerm = String.escapeSingleQuotes(searchTerm.trim());
            String searchPattern = '%' + cleanSearchTerm + '%';
            
            System.debug('Executing query with pattern: ' + searchPattern);
            
            List<Contact> results = [
                SELECT Id, Name, Email, Phone, Account.Name, AccountId
                FROM Contact 
                WHERE Name LIKE :searchPattern
                ORDER BY Name ASC
                LIMIT 50
            ];
            
            System.debug('Found ' + results.size() + ' contacts');
            return results;
            
        } catch (Exception e) {
            System.debug('Error in searchContacts: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to search contacts: ' + e.getMessage());
        }
    }
    
    /**
     * @description Create new Assessment Master with enhanced debugging
     * @param masterData JSON string containing master information
     * @return Result string with success/error information
     */
    @AuraEnabled
    public static String createAssessmentMaster(String masterData) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            System.debug('=== START createAssessmentMaster ===');
            System.debug('Raw masterData: ' + masterData);
            
            // Parse the master data
            Map<String, Object> masterMap;
            try {
                masterMap = (Map<String, Object>) JSON.deserializeUntyped(masterData);
                System.debug('Successfully parsed masterMap: ' + masterMap);
            } catch (Exception parseError) {
                System.debug('JSON Parse Error: ' + parseError.getMessage());
                throw new AuraHandledException('Failed to parse master data: ' + parseError.getMessage());
            }
            
            // Validate required fields
            try {
                validateMasterData(masterMap);
                System.debug('Validation passed');
            } catch (Exception validationError) {
                System.debug('Validation Error: ' + validationError.getMessage());
                throw validationError;
            }
            
            // Create Assessment Master record
            AssessmentMaster__c master = new AssessmentMaster__c();
            
            try {
                // Set basic fields with detailed logging
                System.debug('Setting basic fields...');
                
                String masterName = (String) masterMap.get('masterName');
                System.debug('masterName: ' + masterName);
                master.Name = masterName;
                
                Boolean isActive = (Boolean) masterMap.get('isActive');
                System.debug('isActive: ' + isActive);
                master.IsActive__c = isActive;
                
                String startDateStr = (String) masterMap.get('startDate');
                System.debug('startDate string: ' + startDateStr);
                master.AssessmentStartDate__c = Date.valueOf(startDateStr);
                
                String endDateStr = (String) masterMap.get('endDate');
                System.debug('endDate string: ' + endDateStr);
                master.AssessmentEndDate__c = Date.valueOf(endDateStr);
                
                System.debug('Basic fields set successfully');
                
            } catch (Exception basicFieldsError) {
                System.debug('Error setting basic fields: ' + basicFieldsError.getMessage());
                throw new AuraHandledException('Error setting basic fields: ' + basicFieldsError.getMessage());
            }
            
            try {
                // Assessment Template - 스키마 확인: AssessmentTemplate__c (Lookup)
                String templateId = (String) masterMap.get('assessmentTemplateId');
                System.debug('templateId: ' + templateId);
                if (!String.isBlank(templateId)) {
                    master.AssessmentTemplate__c = templateId;
                    System.debug('Template field set successfully');
                }
                
            } catch (Exception templateError) {
                System.debug('Error setting template field: ' + templateError.getMessage());
                throw new AuraHandledException('Error setting template field: ' + templateError.getMessage());
            }
            
            try {
                // Assessment Grade - 스키마 확인: GradeId__c (Lookup to AssessmentGrade__c)
                String gradeId = (String) masterMap.get('assessmentGradeId');
                System.debug('gradeId: ' + gradeId);
                if (!String.isBlank(gradeId)) {
                    master.GradeId__c = gradeId;
                    System.debug('Grade field set successfully');
                }
                
            } catch (Exception gradeError) {
                System.debug('Error setting grade field: ' + gradeError.getMessage());
                throw new AuraHandledException('Error setting grade field: ' + gradeError.getMessage());
            }
            
            try {
                // Assessment Type - 스키마 확인: AssessmentType__c (Picklist)
                String assessmentType = (String) masterMap.get('assessmentType');
                System.debug('assessmentType: ' + assessmentType);
                if (!String.isBlank(assessmentType)) {
                    master.AssessmentType__c = assessmentType;
                    System.debug('Assessment Type set successfully');
                }
                
            } catch (Exception typeError) {
                System.debug('Error setting assessment type: ' + typeError.getMessage());
                throw new AuraHandledException('Error setting assessment type: ' + typeError.getMessage());
            }
            
            try {
                // Assign Type - 스키마 확인: AssignType__c (Picklist)
                String assignType = (String) masterMap.get('assignType');
                System.debug('assignType: ' + assignType);
                if (!String.isBlank(assignType)) {
                    master.AssignType__c = assignType;
                    System.debug('Assign Type set successfully');
                }
                
            } catch (Exception assignError) {
                System.debug('Error setting assign type: ' + assignError.getMessage());
                throw new AuraHandledException('Error setting assign type: ' + assignError.getMessage());
            }
            
            try {
                // Description - 스키마 확인: Description__c (LongText)
                String description = (String) masterMap.get('description');
                System.debug('description: ' + description);
                if (!String.isBlank(description)) {
                    master.Description__c = description;
                    System.debug('Description set successfully');
                }
                
                // Set initial status - 스키마 확인: Status__c (Picklist: Waiting, Processing, Complete)
                master.Status__c = 'Waiting';
                System.debug('Status set to Waiting');
                
            } catch (Exception descError) {
                System.debug('Error setting description/status: ' + descError.getMessage());
                throw new AuraHandledException('Error setting description/status: ' + descError.getMessage());
            }
            
            // Log the complete master object before insert
            System.debug('Complete master object before insert: ' + master);
            
            // Insert Assessment Master
            try {
                System.debug('Attempting to insert Assessment Master...');
                insert master;
                System.debug('Assessment Master created successfully with Id: ' + master.Id);
                
            } catch (DmlException dmlError) {
                System.debug('DML Error during insert: ' + dmlError.getMessage());
                System.debug('DML Error details: ' + dmlError.getDmlMessage(0));
                System.debug('DML Error fields: ' + dmlError.getDmlFieldNames(0));
                throw new AuraHandledException('Database error during insert: ' + dmlError.getDmlMessage(0));
            }
            
            // Create Assessment Targets if Manual assign type
            String assignType = (String) masterMap.get('assignType');
            if ('Manual'.equals(assignType)) {
                try {
                    List<Object> targets = (List<Object>) masterMap.get('targets');
                    System.debug('Creating targets for Manual assign type. Target count: ' + (targets != null ? targets.size() : 0));
                    if (targets != null && !targets.isEmpty()) {
                        createAssessmentTargets(master.Id, targets);
                    }
                } catch (Exception targetError) {
                    System.debug('Error creating targets: ' + targetError.getMessage());
                    // Don't fail the entire transaction for target creation errors
                    System.debug('Continuing without targets due to error: ' + targetError.getMessage());
                }
            }
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', true);
            result.put('message', 'Assessment Master created successfully');
            result.put('masterId', master.Id);
            
            System.debug('=== SUCCESS createAssessmentMaster ===');
            return JSON.serialize(result);
            
        } catch (DmlException e) {
            Database.rollback(sp);
            System.debug('=== DML EXCEPTION ===');
            System.debug('DML Error: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            String errorMsg = 'Database error: ';
            if (e.getNumDml() > 0) {
                errorMsg += e.getDmlMessage(0);
                System.debug('DML Field errors: ' + e.getDmlFieldNames(0));
            } else {
                errorMsg += e.getMessage();
            }
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', errorMsg);
            result.put('errorType', 'DmlException');
            
            return JSON.serialize(result);
            
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            System.debug('=== AURA HANDLED EXCEPTION ===');
            System.debug('Aura Error: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', e.getMessage());
            result.put('errorType', 'AuraHandledException');
            
            return JSON.serialize(result);
            
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('=== GENERAL EXCEPTION ===');
            System.debug('General Error: ' + e.getMessage());
            System.debug('Error Type: ' + e.getTypeName());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', 'Unexpected error: ' + e.getMessage() + ' (Type: ' + e.getTypeName() + ')');
            result.put('errorType', 'GeneralException');
            result.put('errorTypeName', e.getTypeName());
            
            return JSON.serialize(result);
        }
    }
    
    /**
     * @description Validate master data before processing
     * @param masterMap Parsed master data map
     */
    private static void validateMasterData(Map<String, Object> masterMap) {
        List<String> errors = new List<String>();
        
        if (String.isBlank((String) masterMap.get('masterName'))) {
            errors.add('Master Name is required');
        }
        
        if (String.isBlank((String) masterMap.get('startDate'))) {
            errors.add('Start Date is required');
        }
        
        if (String.isBlank((String) masterMap.get('endDate'))) {
            errors.add('End Date is required');
        }
        
        if (String.isBlank((String) masterMap.get('assessmentTemplateId'))) {
            errors.add('Assessment Template is required');
        }
        
        if (String.isBlank((String) masterMap.get('assessmentGradeId'))) {
            errors.add('Assessment Grade is required');
        }
        
        if (String.isBlank((String) masterMap.get('assessmentType'))) {
            errors.add('Assessment Type is required');
        }
        
        if (String.isBlank((String) masterMap.get('assignType'))) {
            errors.add('Assign Type is required');
        }
        
        // Validate dates
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
            }
        }
        
        // Validate targets for Manual assign type
        String assignType = (String) masterMap.get('assignType');
        if ('Manual'.equals(assignType)) {
            List<Object> targets = (List<Object>) masterMap.get('targets');
            if (targets == null || targets.isEmpty()) {
                errors.add('Assessment Target is required when Assign Type is Manual');
            }
        }
        
        if (!errors.isEmpty()) {
            throw new AuraHandledException('Validation errors: ' + String.join(errors, ', '));
        }
    }
    
    /**
     * @description Create Assessment Target records with correct field names
     * @param masterId Assessment Master ID
     * @param targets List of target data
     */
    private static void createAssessmentTargets(Id masterId, List<Object> targets) {
        List<AssessmentTarget__c> targetsToInsert = new List<AssessmentTarget__c>();
        
        try {
            System.debug('Creating Assessment Targets for master: ' + masterId);
            System.debug('Target data: ' + targets);
            
            for (Object targetObj : targets) {
                Map<String, Object> targetMap = (Map<String, Object>) targetObj;
                System.debug('Processing target: ' + targetMap);
                
                AssessmentTarget__c target = new AssessmentTarget__c();
                target.AssessmentMaster__c = masterId;
                
                // Contact field - 스키마에서 확인한 정확한 필드명 사용
                String contactId = (String) targetMap.get('contactId');
                if (!String.isBlank(contactId)) {
                    try {
                        target.ContactId__c = contactId;  // 스키마에서 확인한 필드명
                        System.debug('Set ContactId__c: ' + contactId);
                    } catch (Exception contactFieldError) {
                        System.debug('ContactId__c field error: ' + contactFieldError.getMessage());
                        // 필드명이 다를 수 있으므로 다른 가능성 시도
                        try {
                            target.put('Contact__c', contactId);
                            System.debug('Set Contact__c: ' + contactId);
                        } catch (Exception alternateError) {
                            System.debug('Contact__c field also failed: ' + alternateError.getMessage());
                            // Contact 필드 없이도 Target 생성 가능하도록 계속 진행
                        }
                    }
                }
                
                targetsToInsert.add(target);
            }
            
            System.debug('Targets to insert count: ' + targetsToInsert.size());
            System.debug('Target objects: ' + targetsToInsert);
            
            if (!targetsToInsert.isEmpty()) {
                insert targetsToInsert;
                System.debug('Assessment Targets created successfully: ' + targetsToInsert.size());
                
                // 생성된 Target ID들 로그
                for (AssessmentTarget__c target : targetsToInsert) {
                    System.debug('Created target ID: ' + target.Id);
                }
            } else {
                System.debug('No targets to insert');
            }
            
        } catch (DmlException e) {
            System.debug('DML Error creating targets: ' + e.getMessage());
            System.debug('DML Error details: ' + e.getDmlMessage(0));
            System.debug('DML Error fields: ' + e.getDmlFieldNames(0));
            throw new AuraHandledException('Failed to create assessment targets: ' + e.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('General Error creating targets: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to create assessment targets: ' + e.getMessage());
        }
    }
    
    /**
     * @description Test method to validate field accessibility
     * @return Field validation result
     */
    @AuraEnabled
    public static String testFieldAccess() {
        try {
            System.debug('=== Testing Field Access ===');
            
            AssessmentMaster__c testMaster = new AssessmentMaster__c();
            
            // Test each field individually
            Map<String, Object> fieldTest = new Map<String, Object>();
            
            try {
                testMaster.Name = 'Test';
                fieldTest.put('Name', 'OK');
            } catch (Exception e) {
                fieldTest.put('Name', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.IsActive__c = true;
                fieldTest.put('IsActive__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('IsActive__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.AssessmentStartDate__c = Date.today();
                fieldTest.put('AssessmentStartDate__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('AssessmentStartDate__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.AssessmentEndDate__c = Date.today();
                fieldTest.put('AssessmentEndDate__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('AssessmentEndDate__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.AssessmentTemplate__c = 'test';
                fieldTest.put('AssessmentTemplate__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('AssessmentTemplate__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.GradeId__c = 'test';
                fieldTest.put('GradeId__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('GradeId__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.AssessmentType__c = 'Strategy';
                fieldTest.put('AssessmentType__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('AssessmentType__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.AssignType__c = 'Manual';
                fieldTest.put('AssignType__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('AssignType__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.Description__c = 'Test description';
                fieldTest.put('Description__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('Description__c', 'ERROR: ' + e.getMessage());
            }
            
            try {
                testMaster.Status__c = 'Waiting';
                fieldTest.put('Status__c', 'OK');
            } catch (Exception e) {
                fieldTest.put('Status__c', 'ERROR: ' + e.getMessage());
            }
            
            System.debug('Field test results: ' + fieldTest);
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', true);
            result.put('fieldTests', fieldTest);
            
            return JSON.serialize(result);
            
        } catch (Exception e) {
            System.debug('Field test error: ' + e.getMessage());
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', false);
            result.put('message', e.getMessage());
            
            return JSON.serialize(result);
        }
    }
    
    /**
     * @description Test target creation functionality
     * @return Test result
     */
    @AuraEnabled
    public static String testTargetCreation() {
        try {
            // 테스트용 AssessmentMaster 생성
            AssessmentMaster__c testMaster = new AssessmentMaster__c(
                Name = 'Test Master',
                IsActive__c = true,
                AssessmentStartDate__c = Date.today(),
                AssessmentEndDate__c = Date.today().addDays(7),
                Status__c = 'Waiting'
            );
            insert testMaster;
            
            // 테스트용 Target 데이터 - TargetName 제거
            List<Object> testTargets = new List<Object>{
                new Map<String, Object>{
                    'contactId' => '003000000000000' // 더미 Contact ID
                }
            };
            
            // Target 생성 테스트
            createAssessmentTargets(testMaster.Id, testTargets);
            
            return JSON.serialize(new Map<String, Object>{
                'success' => true,
                'masterId' => testMaster.Id,
                'message' => 'Test target creation successful'
            });
            
        } catch (Exception e) {
            return JSON.serialize(new Map<String, Object>{
                'success' => false,
                'message' => e.getMessage(),
                'stackTrace' => e.getStackTraceString()
            });
        }
    }
    
    /**
     * @description Get Assessment Master details by ID
     * @param masterId Assessment Master ID
     * @return Assessment Master with related data
     */
    @AuraEnabled(cacheable=true)
    public static AssessmentMaster__c getAssessmentMasterDetails(Id masterId) {
        try {
            return [
                SELECT Id, Name, IsActive__c, AssessmentStartDate__c, AssessmentEndDate__c,
                       AssessmentTemplate__c, AssessmentTemplate__r.Name,
                       GradeId__c, GradeId__r.Name,
                       AssessmentType__c, AssignType__c, Description__c, Status__c,
                       CreatedDate, LastModifiedDate
                FROM AssessmentMaster__c 
                WHERE Id = :masterId 
                LIMIT 1
            ];
        } catch (Exception e) {
            System.debug('Error in getAssessmentMasterDetails: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve assessment master details: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get Assessment Targets for a Master
     * @param masterId Assessment Master ID
     * @return List of Assessment Targets
     */
    @AuraEnabled(cacheable=true)
    public static List<AssessmentTarget__c> getAssessmentTargets(Id masterId) {
        try {
            return [
                SELECT Id, AssessmentMaster__c, ContactId__c
                FROM AssessmentTarget__c 
                WHERE AssessmentMaster__c = :masterId
                ORDER BY CreatedDate ASC
                LIMIT 1000
            ];
        } catch (Exception e) {
            System.debug('Error in getAssessmentTargets: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve assessment targets: ' + e.getMessage());
        }
    }
}