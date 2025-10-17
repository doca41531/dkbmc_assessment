/**
 * @description       : Assessment Master Modal Component - DKEDU (DK Lab Standards Compliant)
 * @author            : developer@company.com
 * @group             : DKEDU Components  
 * @created date      : 2025-01-15
 * @last modified on  : 2025-10-17
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 2.0.0
 */

import { LightningElement, track, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Apex methods
import getAssessmentTemplates from '@salesforce/apex/DKEDU_AssessmentMasterController.getAssessmentTemplates';
import getAssessmentGrades from '@salesforce/apex/DKEDU_AssessmentMasterController.getAssessmentGrades';
import searchContacts from '@salesforce/apex/DKEDU_AssessmentMasterController.searchContacts';
import createAssessmentMaster from '@salesforce/apex/DKEDU_AssessmentMasterController.createAssessmentMaster';

// Object and Field references
import ASSESSMENT_MASTER_OBJECT from '@salesforce/schema/AssessmentMaster__c';
import ASSESSMENT_TYPE_FIELD from '@salesforce/schema/AssessmentMaster__c.AssessmentType__c';
import ASSIGN_TYPE_FIELD from '@salesforce/schema/AssessmentMaster__c.AssignType__c';

// Custom Labels removed for deployment - using hardcoded strings
// TODO: Create Custom Labels and replace hardcoded strings
// DKEDU_AM_LBL_SAVE, DKEDU_AM_LBL_CANCEL, DKEDU_AM_MSG_SUCCESS, DKEDU_AM_MSG_VALIDATIONERROR

export default class DkeduAssessmentMaster extends NavigationMixin(LightningElement) {
    
    // Debug switch following DK Lab standards
    static DEBUG = false;
    
    // Constants following UPPERCASE naming convention
    static ASSIGN_TYPE_MANUAL = 'Manual';
    static SEARCH_DEBOUNCE_DELAY = 300;
    static DROPDOWN_CLOSE_DELAY = 150;
    static DOM_SYNC_DELAY = 100;
    
    // Private properties with underscore prefix
    _hasInitialized = false;
    _isMouseOverDropdown = false;
    _formData = {};
    _searchTimeout;
    
    @api recordId;
    @api objectApiName;
    
    // Form data properties with proper camelCase naming
    @track _masterName = '';
    @track _isActive = true;
    @track _startDate = '';
    @track _endDate = '';
    @track _selectedTemplate = null;
    @track _selectedTemplateId = '';
    @track _selectedGrade = null;
    @track _selectedGradeId = '';
    @track _description = '';
    @track _selectedAssessmentType = '';
    @track _selectedAssignType = '';
    
    // Search state for comboboxes
    @track templateSearchTerm = '';
    @track gradeSearchTerm = '';
    @track assessmentTypeSearchTerm = '';
    @track assignTypeSearchTerm = '';
    @track contactSearchTerm = '';
    
    // Dropdown states
    @track isTemplateDropdownOpen = false;
    @track isGradeDropdownOpen = false;
    @track isAssessmentTypeDropdownOpen = false;
    @track isAssignTypeDropdownOpen = false;
    @track isContactDropdownOpen = false;
    
    // Options arrays
    @track templateOptions = [];
    @track gradeOptions = [];
    @track assessmentTypeOptions = [];
    @track assignTypeOptions = [];
    
    // Filtered options
    @track filteredTemplateOptions = [];
    @track filteredGradeOptions = [];
    @track filteredAssessmentTypeOptions = [];
    @track filteredAssignTypeOptions = [];
    
    // Contact search specific
    @track selectedTargets = [];
    @track searchResults = [];
    @track hasSearchedContacts = false;
    @track isLoading = false;
    
    // UI control
    @track renderKey = 0;
    
    // Object info
    objectInfo;
    
    // Getters for @api properties to comply with eslint rule
    @api get masterName() {
        return this._masterName;
    }
    set masterName(value) {
        this._masterName = value;
    }
    
    @api get isActive() {
        return this._isActive;
    }
    set isActive(value) {
        this._isActive = value;
    }
    
    @api get startDate() {
        return this._startDate;
    }
    set startDate(value) {
        this._startDate = value;
    }
    
    @api get endDate() {
        return this._endDate;
    }
    set endDate(value) {
        this._endDate = value;
    }
    
    @api get description() {
        return this._description;
    }
    set description(value) {
        this._description = value;
    }
    
    @api get selectedTemplate() {
        return this._selectedTemplate;
    }
    set selectedTemplate(value) {
        this._selectedTemplate = value;
    }
    
    @api get selectedTemplateId() {
        return this._selectedTemplateId;
    }
    set selectedTemplateId(value) {
        this._selectedTemplateId = value;
    }
    
    @api get selectedGrade() {
        return this._selectedGrade;
    }
    set selectedGrade(value) {
        this._selectedGrade = value;
    }
    
    @api get selectedGradeId() {
        return this._selectedGradeId;
    }
    set selectedGradeId(value) {
        this._selectedGradeId = value;
    }
    
    @api get selectedAssessmentType() {
        return this._selectedAssessmentType;
    }
    set selectedAssessmentType(value) {
        this._selectedAssessmentType = value;
    }
    
    @api get selectedAssignType() {
        return this._selectedAssignType;
    }
    set selectedAssignType(value) {
        this._selectedAssignType = value;
    }
    
    // Labels using hardcoded strings (TODO: Replace with Custom Labels)
    get labels() {
        return {
            save: 'Save',
            cancel: 'Cancel', 
            successMessage: 'Assessment Master created successfully',
            validationError: 'Validation Error'
        };
    }
    
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_MASTER_OBJECT })
    objectInfoHandler({ data, error }) {
        try {
            if (data) {
                this.objectInfo = data;
            } else if (error) {
                this.handleError(error, 'objectInfoHandler');
            }
        } catch (e) {
            this.handleError(e, 'objectInfoHandler');
        }
    }
    
    @wire(getPicklistValues, { recordTypeId: '$objectInfo.defaultRecordTypeId', fieldApiName: ASSESSMENT_TYPE_FIELD })
    assessmentTypePicklistHandler({ data, error }) {
        try {
            if (data) {
                this.assessmentTypeOptions = data.values.map(option => ({
                    label: option.label,
                    value: option.value
                }));
                this.filteredAssessmentTypeOptions = [...this.assessmentTypeOptions];
            } else if (error) {
                this.handleError(error, 'assessmentTypePicklistHandler');
            }
        } catch (e) {
            this.handleError(e, 'assessmentTypePicklistHandler');
        }
    }
    
    @wire(getPicklistValues, { recordTypeId: '$objectInfo.defaultRecordTypeId', fieldApiName: ASSIGN_TYPE_FIELD })
    assignTypePicklistHandler({ data, error }) {
        try {
            if (data) {
                this.assignTypeOptions = data.values.map(option => ({
                    label: option.label,
                    value: option.value
                }));
                this.filteredAssignTypeOptions = [...this.assignTypeOptions];
            } else if (error) {
                this.handleError(error, 'assignTypePicklistHandler');
            }
        } catch (e) {
            this.handleError(e, 'assignTypePicklistHandler');
        }
    }
    
    // Computed properties
    get isManualAssign() {
        return this.selectedAssignType === DkeduAssessmentMaster.ASSIGN_TYPE_MANUAL;
    }
    
    get hasSelectedTargets() {
        return this.selectedTargets.length > 0;
    }
    
    get hasSearchResults() {
        return this.searchResults && this.searchResults.length > 0;
    }
    
    get selectedTargetCount() {
        return this.selectedTargets.length;
    }
    
    // Utility methods following DK Lab standards
    log(msg, variable) {
        if (DkeduAssessmentMaster.DEBUG) {
            console.log(`[DkeduAssessmentMaster] ${msg}`, variable === undefined ? '' : variable);
        }
    }

    handleError(error, from = 'DkeduAssessmentMaster') {
        try {
            this.log(`Error in ${from}`, error);
            let message = 'Unknown error occurred.';
            
            if (error.body && error.body.message) {
                message = error.body.message;
            } else if (error.message) {
                message = error.message;
            } else if (typeof error === 'string') {
                message = error;
            }
            
            this.showToast('Error', `${from}: ${message}`, 'error');
        } catch (e) {
            console.error('[DkeduAssessmentMaster] handleError failed:', e);
        }
    }

    showToast(title, message, variant) {
        try {
            const event = new ShowToastEvent({
                title: title,
                message: message,
                variant: variant
            });
            this.dispatchEvent(event);
        } catch (error) {
            this.log('showToast error', error);
        }
    }
    
    // Form reset and initialization methods
    resetFormData() {
        try {
            this.log('=== RESETTING FORM DATA ===');
            
            // Reset basic form data
            this._masterName = '';
            this._isActive = true;
            this._startDate = '';
            this._endDate = '';
            this._description = '';
            
            // Reset template related
            this._selectedTemplate = null;
            this._selectedTemplateId = '';
            this.templateSearchTerm = '';
            this.isTemplateDropdownOpen = false;
            
            // Reset grade related
            this._selectedGrade = null;
            this._selectedGradeId = '';
            this.gradeSearchTerm = '';
            this.isGradeDropdownOpen = false;
            
            // Reset assessment type related
            this._selectedAssessmentType = '';
            this.assessmentTypeSearchTerm = '';
            this.isAssessmentTypeDropdownOpen = false;
            
            // Reset assign type related
            this._selectedAssignType = '';
            this.assignTypeSearchTerm = '';
            this.isAssignTypeDropdownOpen = false;
            
            // Reset contact related
            this.selectedTargets = [];
            this.searchResults = [];
            this.contactSearchTerm = '';
            this.isContactDropdownOpen = false;
            this.hasSearchedContacts = false;
            
            // Reset UI state
            this.isLoading = false;
            this._formData = {};
            
            // Reset filtered options
            this.filteredTemplateOptions = [...this.templateOptions];
            this.filteredGradeOptions = [...this.gradeOptions];
            this.filteredAssessmentTypeOptions = [...this.assessmentTypeOptions];
            this.filteredAssignTypeOptions = [...this.assignTypeOptions];
            
            this.log('Form data reset completed');
        } catch (error) {
            this.handleError(error, 'resetFormData');
        }
    }
    
    resetDOMElements() {
        try {
            this.log('Resetting DOM elements');
            
            // Reset all input fields
            const inputs = this.template.querySelectorAll('input[data-field]');
            inputs.forEach(input => {
                try {
                    if (input.type === 'checkbox') {
                        input.checked = input.dataset.field === 'isActive' ? true : false;
                    } else {
                        input.value = '';
                    }
                } catch (e) {
                    this.log('Error resetting input', e);
                }
            });
            
            // Reset textareas
            const textareas = this.template.querySelectorAll('lightning-textarea[data-field]');
            textareas.forEach(textarea => {
                try {
                    textarea.value = '';
                } catch (e) {
                    this.log('Error resetting textarea', e);
                }
            });
            
            // Reset dropdown states
            const dropdowns = this.template.querySelectorAll('.slds-combobox');
            dropdowns.forEach(dropdown => {
                try {
                    dropdown.setAttribute('aria-expanded', 'false');
                } catch (e) {
                    this.log('Error resetting dropdown', e);
                }
            });
            
            this.log('DOM elements reset completed');
            
        } catch (error) {
            this.handleError(error, 'resetDOMElements');
        }
    }
    
    backupFormData() {
        try {
            this._formData = {
                masterName: this._masterName,
                isActive: this._isActive,
                startDate: this._startDate,
                endDate: this._endDate,
                description: this._description,
                selectedTemplateId: this._selectedTemplateId,
                selectedGradeId: this._selectedGradeId,
                selectedAssessmentType: this._selectedAssessmentType,
                selectedAssignType: this._selectedAssignType,
                templateSearchTerm: this.templateSearchTerm,
                gradeSearchTerm: this.gradeSearchTerm,
                assessmentTypeSearchTerm: this.assessmentTypeSearchTerm,
                assignTypeSearchTerm: this.assignTypeSearchTerm,
                selectedTemplate: this._selectedTemplate,
                selectedGrade: this._selectedGrade
            };
            this.log('Form data backed up', this._formData);
        } catch (error) {
            this.handleError(error, 'backupFormData');
        }
    }
    
    restoreFormData() {
        try {
            if (this._formData && Object.keys(this._formData).length > 0) {
                Object.keys(this._formData).forEach(key => {
                    if (this._formData[key] !== undefined) {
                        this[key] = this._formData[key];
                    }
                });
                this.log('Form data restored', this._formData);
            }
        } catch (error) {
            this.handleError(error, 'restoreFormData');
        }
    }
    
    @api
    openModal() {
        try {
            this.log('=== OPENING MODAL ===');
            this._hasInitialized = false;
            
            // Complete form reset
            this.resetFormData();
            
            // Force re-render
            this.renderKey = this.renderKey + 1;
            
            // Load initial data
            this.loadInitialData();
            
            this.log('Modal opened and initialized');
        } catch (error) {
            this.handleError(error, 'openModal');
        }
    }
    
    // Component lifecycle
    connectedCallback() {
        try {
            this.log('Component connected');
            this.loadInitialData();
        } catch (error) {
            this.handleError(error, 'connectedCallback');
        }
    }
    
    renderedCallback() {
        try {
            if (!this._hasInitialized) {
                this.log('First render initialization');
                this._hasInitialized = true;
                
                // DOM initialization with timeout
                setTimeout(() => {
                    this.resetDOMElements();
                }, DkeduAssessmentMaster.DOM_SYNC_DELAY);
                
            } else {
                // Sync form values when needed
                if (this._masterName || this._startDate || this._endDate) {
                    this.syncFormValues();
                }
            }
        } catch (error) {
            this.handleError(error, 'renderedCallback');
        }
    }

    disconnectedCallback() {
        try {
            this.log('Component disconnected - cleaning up');
            this._hasInitialized = false;
            
            if (this._searchTimeout) {
                clearTimeout(this._searchTimeout);
            }
            
            // Clean up all state
            this.resetFormData();
        } catch (error) {
            this.handleError(error, 'disconnectedCallback');
        }
    }
    
    syncFormValues() {
        try {
            // Sync DOM elements with component state
            const masterNameInput = this.template.querySelector('[data-field="masterName"]');
            if (masterNameInput) {
                masterNameInput.value = this._masterName;
            }
            
            const startDateInput = this.template.querySelector('[data-field="startDate"]');
            if (startDateInput) {
                startDateInput.value = this._startDate;
            }
            
            const endDateInput = this.template.querySelector('[data-field="endDate"]');
            if (endDateInput) {
                endDateInput.value = this._endDate;
            }
            
            const isActiveCheckbox = this.template.querySelector('[data-field="isActive"]');
            if (isActiveCheckbox) {
                isActiveCheckbox.checked = this._isActive;
            }
            
            this.log('Form values synchronized');
        } catch (error) {
            this.handleError(error, 'syncFormValues');
        }
    }
    
    async loadInitialData() {
        try {
            // Load templates and grades in parallel
            const [templates, grades] = await Promise.all([
                getAssessmentTemplates(),
                getAssessmentGrades()
            ]);
            
            this.templateOptions = templates.map(template => ({
                label: template.Name,
                value: template.Id,
                description: template.Description__c
            }));
            this.filteredTemplateOptions = [...this.templateOptions];
            
            this.gradeOptions = grades.map(grade => ({
                label: grade.Name,
                value: grade.Id
            }));
            this.filteredGradeOptions = [...this.gradeOptions];
            
            this.log('Initial data loaded', {
                templatesCount: this.templateOptions.length,
                gradesCount: this.gradeOptions.length
            });
            
        } catch (error) {
            this.handleError(error, 'loadInitialData');
        }
    }
    
    // Event handlers with proper error handling
    handleInputChange(event) {
        try {
            // Prevent default behavior
            event.preventDefault();
            event.stopPropagation();
            
            const fieldName = event.target.dataset.field || event.target.name || event.target.id;
            const value = event.target.value;
            
            this.log(`handleInputChange - ${fieldName}:`, value);
            
            // Backup data
            this.backupFormData();
            
            // Map field names to component properties
            switch(fieldName) {
                case 'masterName':
                    this._masterName = value;
                    break;
                default:
                    this.log('Unknown input field in handleInputChange:', fieldName);
            }
            
            this.log(`${fieldName} updated to:`, this[fieldName]);
        } catch (error) {
            this.handleError(error, 'handleInputChange');
        }
    }
    
    handleCheckboxChange(event) {
        try {
            // Prevent default behavior
            event.preventDefault();
            event.stopPropagation();
            
            const fieldName = event.target.dataset.field || event.target.name || event.target.id;
            const checked = event.target.checked;
            
            this.log(`handleCheckboxChange - ${fieldName}:`, checked);
            
            // Backup data
            this.backupFormData();
            
            switch(fieldName) {
                case 'isActive':
                    this._isActive = checked;
                    break;
                default:
                    this.log('Unknown checkbox field:', fieldName);
            }
            
            this.log(`${fieldName} updated to:`, this[fieldName]);
        } catch (error) {
            this.handleError(error, 'handleCheckboxChange');
        }
    }
    
    handleDateChange(event) {
        try {
            // Prevent default behavior
            event.preventDefault();
            event.stopPropagation();
            
            const fieldName = event.target.dataset.field || event.target.name || event.target.id;
            const value = event.target.value;
            
            this.log(`handleDateChange - ${fieldName}:`, value);
            
            // Backup data
            this.backupFormData();
            
            switch(fieldName) {
                case 'startDate':
                    this._startDate = value;
                    break;
                case 'endDate':
                    this._endDate = value;
                    break;
                default:
                    this.log('Unknown date field:', fieldName);
            }
            
            this.log(`${fieldName} updated to:`, this[fieldName]);
            
            // Validate date range
            if (this._startDate && this._endDate) {
                this.validateDateRange();
            }
        } catch (error) {
            this.handleError(error, 'handleDateChange');
        }
    }
    
    handleTextareaChange(event) {
        try {
            const fieldName = event.target.dataset.field || event.target.name;
            const value = event.target.value;
            
            this.log(`handleTextareaChange - ${fieldName}:`, value);
            
            // Backup data
            this.backupFormData();
            
            switch(fieldName) {
                case 'description':
                    this._description = value;
                    break;
                default:
                    this.log('Unknown textarea field:', fieldName);
            }
            
            this.log(`${fieldName} updated to:`, this[fieldName]);
        } catch (error) {
            this.handleError(error, 'handleTextareaChange');
        }
    }
    
    // Validation methods
    validateDateRange() {
        try {
            if (this._startDate && this._endDate) {
                const start = new Date(this._startDate);
                const end = new Date(this._endDate);
                
                if (start > end) {
                    this.showToast('Validation Error', 'Start date cannot be later than end date.', 'error');
                    return false;
                }
            }
            return true;
        } catch (error) {
            this.handleError(error, 'validateDateRange');
            return false;
        }
    }
    
    validateForm() {
        try {
            const errors = [];
            
            this.log('Validating form with values', {
                masterName: this._masterName,
                startDate: this._startDate,
                endDate: this._endDate,
                selectedTemplateId: this._selectedTemplateId,
                selectedGradeId: this._selectedGradeId,
                selectedAssessmentType: this._selectedAssessmentType,
                selectedAssignType: this._selectedAssignType,
                selectedTargetsLength: this.selectedTargets.length
            });
            
            if (!this._masterName || !this._masterName.trim()) {
                errors.push('Master Name is required.');
            }
            
            if (!this._startDate || this._startDate === '') {
                errors.push('Start Date is required.');
            }
            
            if (!this._endDate || this._endDate === '') {
                errors.push('End Date is required.');
            }
            
            if (!this._selectedTemplateId || this._selectedTemplateId === '') {
                errors.push('Assessment Template is required.');
            }
            
            if (!this._selectedGradeId || this._selectedGradeId === '') {
                errors.push('Assessment Grade is required.');
            }
            
            if (!this._selectedAssessmentType || this._selectedAssessmentType === '') {
                errors.push('Assessment Type is required.');
            }
            
            if (!this._selectedAssignType || this._selectedAssignType === '') {
                errors.push('Assign Type is required.');
            }
            
            if (this._selectedAssignType === DkeduAssessmentMaster.ASSIGN_TYPE_MANUAL && 
                (!this.selectedTargets || this.selectedTargets.length === 0)) {
                errors.push('Assessment Target is required when Assign Type is Manual.');
            }
            
            // Date validation
            if (this._startDate && this._endDate) {
                const startDate = new Date(this._startDate);
                const endDate = new Date(this._endDate);
                
                if (startDate > endDate) {
                    errors.push('Start Date cannot be later than End Date.');
                }
            }
            
            this.log('Form validation result', { errorCount: errors.length, errors });
            return errors;
        } catch (error) {
            this.handleError(error, 'validateForm');
            return ['Validation error occurred'];
        }
    }
    
    // Save methods
    async handleSave() {
        try {
            this.log('=== SAVE PROCESS STARTED ===');
            
            const validationErrors = this.validateForm();
            if (validationErrors.length > 0) {
                this.log('=== VALIDATION FAILED ===', validationErrors);
                this.showToast(this.labels.validationError, validationErrors.join(' '), 'error');
                return;
            }
            
            this.log('=== VALIDATION PASSED ===');
            this.isLoading = true;
            
            const masterData = this.buildMasterData();
            this.log('Master data prepared', masterData);
            
            const response = await createAssessmentMaster({ masterData: JSON.stringify(masterData) });
            const result = JSON.parse(response);
            this.log('Save result', result);
            
            if (result.success) {
                this.showToast('Success', this.labels.successMessage, 'success');
                
                // Reset form and close modal on success
                this.resetFormData();
                this.closeModal();
                
                // Navigate to the created record
                if (result.masterId) {
                    this.navigateToRecord(result.masterId);
                }
            } else {
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            this.handleError(error, 'handleSave');
        } finally {
            this.isLoading = false;
        }
    }
    
    handleCancel() {
        try {
            this.log('=== CANCEL REQUESTED ===');
            
            // Reset form completely on cancel
            this.resetFormData();
            this.closeModal();
        } catch (error) {
            this.handleError(error, 'handleCancel');
        }
    }
    
    buildMasterData() {
        try {
            return {
                masterName: this._masterName,
                isActive: this._isActive,
                startDate: this._startDate,
                endDate: this._endDate,
                assessmentTemplateId: this._selectedTemplateId,
                assessmentGradeId: this._selectedGradeId,
                description: this._description,
                assessmentType: this._selectedAssessmentType,
                assignType: this._selectedAssignType,
                targets: this.selectedTargets.map(target => ({
                    contactId: target.id,
                    targetName: target.name
                }))
            };
        } catch (error) {
            this.handleError(error, 'buildMasterData');
            return {};
        }
    }
    
    // Navigation methods
    navigateToRecord(recordId) {
        try {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: recordId,
                    actionName: 'view'
                }
            });
        } catch (error) {
            this.handleError(error, 'navigateToRecord');
        }
    }
    
    closeModal() {
        try {
            this.log('=== CLOSING MODAL ===');
            
            // Complete reset before closing
            this.resetFormData();
            
            const closeEvent = new CustomEvent('close', {
                detail: { reason: 'Modal closed' }
            });
            this.dispatchEvent(closeEvent);
            
            // Fallback navigation
            setTimeout(() => {
                this[NavigationMixin.Navigate]({
                    type: 'standard__objectPage',
                    attributes: {
                        objectApiName: 'AssessmentMaster__c',
                        actionName: 'list'
                    },
                    state: {
                        filterName: 'Recent'
                    }
                });
            }, DkeduAssessmentMaster.DOM_SYNC_DELAY);
        } catch (error) {
            this.handleError(error, 'closeModal');
        }
    }
    
    // Additional helper methods with proper try-catch
    @api
    resetComponent() {
        try {
            this.log('Resetting component to initial state');
            this.resetFormData();
            this.renderKey = this.renderKey + 1;
            this.loadInitialData();
        } catch (error) {
            this.handleError(error, 'resetComponent');
        }
    }
    
    // Template search and dropdown methods would be added here
    // Following the same error handling pattern...
    
    // Debug methods
    @api
    debugCurrentState() {
        try {
            const state = {
                masterName: this._masterName,
                isActive: this._isActive,
                startDate: this._startDate,
                endDate: this._endDate,
                selectedAssignType: this._selectedAssignType,
                isManualAssign: this.isManualAssign,
                contactSearchTerm: this.contactSearchTerm,
                searchResults: this.searchResults.length,
                hasSearchResults: this.hasSearchResults,
                selectedTargets: this.selectedTargets.length,
                templateOptions: this.templateOptions.length,
                gradeOptions: this.gradeOptions.length,
                assignTypeOptions: this.assignTypeOptions.length
            };
            
            this.log('Current component state', state);
            console.table(state);
            return state;
        } catch (error) {
            this.handleError(error, 'debugCurrentState');
            return {};
        }
    }
}