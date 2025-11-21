/**
 * @description       : Lightning Modal Assessment Master Component
 * @author            : mingyu.park@dkbmc.com
 * @group             : DKEDU Components
 * @created date      : 2025-11-06
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 2.0.0
 */

import { api, track, wire } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

// Schema Imports
import ASSESSMENT_MASTER_OBJECT from '@salesforce/schema/AssessmentMaster__c';
import ASSESSMENT_TYPE_FIELD from '@salesforce/schema/AssessmentMaster__c.AssessmentType__c';
import ASSIGN_TYPE_FIELD from '@salesforce/schema/AssessmentMaster__c.AssignType__c';

// Apex Methods
import getAssessmentTemplates from '@salesforce/apex/DKEDU_AssessmentMasterController.getAssessmentTemplates';
import getAssessmentGrades from '@salesforce/apex/DKEDU_AssessmentMasterController.getAssessmentGrades';
import searchContacts from '@salesforce/apex/DKEDU_AssessmentMasterController.searchContacts';
import createAssessmentMaster from '@salesforce/apex/DKEDU_AssessmentMasterController.createAssessmentMaster';

const DEBUG = true;
const ASSIGN_TYPE_MANUAL = 'Manual';
const SEARCH_DEBOUNCE_DELAY = 300;

export default class DkeduAssessmentMasterModal extends LightningModal {
    @api parentRecordId;
    
    @track isLoading = false;
    @track formData = this.getInitialFormData();
    @track searchResults = [];

    _objectInfo = null;
    _templateOptions = [];
    _gradeOptions = [];
    _assessmentTypeOptions = [];
    _assignTypeOptions = [];
    _isInitialized = false;
    _hasObjectInfoError = false;
    _hasPicklistError = false;
    _searchTimeout;
    
    get templateOptions() {
        try {
            return this._templateOptions || [];
        } catch (error) {
            this.handleError(error, 'templateOptions getter');
            return [];
        }
    }
    
    get gradeOptions() {
        try {
            return this._gradeOptions || [];
        } catch (error) {
            this.handleError(error, 'gradeOptions getter');
            return [];
        }
    }
    
    get assessmentTypeOptions() {
        try {
            return this._assessmentTypeOptions.length > 0 ? this._assessmentTypeOptions : this.getDefaultAssessmentTypes();
        } catch (error) {
            this.handleError(error, 'assessmentTypeOptions getter');
            return this.getDefaultAssessmentTypes();
        }
    }
    
    get assignTypeOptions() {
        try {
            return this._assignTypeOptions.length > 0 ? this._assignTypeOptions : this.getDefaultAssignTypes();
        } catch (error) {
            this.handleError(error, 'assignTypeOptions getter');
            return this.getDefaultAssignTypes();
        }
    }
    
    get isManualAssign() {
        try {
            return this.formData.assignType === ASSIGN_TYPE_MANUAL;
        } catch (error) {
            this.handleError(error, 'isManualAssign getter');
            return false;
        }
    }
    
    get hasSelectedTargets() {
        try {
            return this.formData.selectedTargets && this.formData.selectedTargets.length > 0;
        } catch (error) {
            this.handleError(error, 'hasSelectedTargets getter');
            return false;
        }
    }
    
    get hasSearchResults() {
        try {
            return this.searchResults && this.searchResults.length > 0;
        } catch (error) {
            this.handleError(error, 'hasSearchResults getter');
            return false;
        }
    }
    
    get selectedTargetCount() {
        try {
            return this.formData.selectedTargets ? this.formData.selectedTargets.length : 0;
        } catch (error) {
            this.handleError(error, 'selectedTargetCount getter');
            return 0;
        }
    }
    
    getDefaultAssessmentTypes() {
        try {
            return [
                { label: 'Quiz', value: 'Quiz' },
                { label: 'Test', value: 'Test' },
                { label: 'Survey', value: 'Survey' },
                { label: 'Assignment', value: 'Assignment' }
            ];
        } catch (error) {
            this.handleError(error, 'getDefaultAssessmentTypes');
            return [];
        }
    }
    
    getDefaultAssignTypes() {
        try {
            return [
                { label: 'Manual', value: 'Manual' },
                { label: 'Automatic', value: 'Automatic' },
                { label: 'Group', value: 'Group' }
            ];
        } catch (error) {
            this.handleError(error, 'getDefaultAssignTypes');
            return [];
        }
    }
    
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_MASTER_OBJECT })
    wiredObjectInfo({ data, error }) {
        try {
            if (data) {
                this._objectInfo = data;
                this._hasObjectInfoError = false;
            } else if (error) {
                this._hasObjectInfoError = true;
                this.handleError(error, 'wiredObjectInfo');
            }
        } catch (unexpectedError) {
            this._hasObjectInfoError = true;
            this.handleError(unexpectedError, 'wiredObjectInfo - unexpected error');
        }
    }
    
    @wire(getPicklistValues, { 
        recordTypeId: '$_objectInfo.defaultRecordTypeId', 
        fieldApiName: ASSESSMENT_TYPE_FIELD 
    })
    wiredAssessmentTypePicklist({ data, error }) {
        try {
            if (data && this._objectInfo && !this._hasObjectInfoError) {
                this._assessmentTypeOptions = data.values.map(option => ({
                    value: option.value || '',
                    label: option.label || option.value || 'Unknown'
                }));
                this._hasPicklistError = false;
                this.log('Assessment Type picklist loaded', data.values);
            } else if (error) {
                this._hasPicklistError = true;
                this.handleError(error, 'wiredAssessmentTypePicklist');
                this._assessmentTypeOptions = this.getDefaultAssessmentTypes();
            }
        } catch (unexpectedError) {
            this._hasPicklistError = true;
            this.handleError(unexpectedError, 'wiredAssessmentTypePicklist - unexpected error');
            this._assessmentTypeOptions = this.getDefaultAssessmentTypes();
        }
    }
    
    @wire(getPicklistValues, {
        recordTypeId: '$_objectInfo.defaultRecordTypeId', 
        fieldApiName: ASSIGN_TYPE_FIELD 
    })
    wiredAssignTypePicklist({ data, error }) {
        try {
            if (data && this._objectInfo && !this._hasObjectInfoError) {
                this._assignTypeOptions = data.values.map(option => ({
                    value: option.value || '',
                    label: option.label || option.value || 'Unknown'
                }));
                this._hasPicklistError = false;
                this.log('Assign Type picklist loaded', data.values);
            } else if (error) {
                this._hasPicklistError = true;
                this.handleError(error, 'wiredAssignTypePicklist');
                this._assignTypeOptions = this.getDefaultAssignTypes();
            }
        } catch (unexpectedError) {
            this._hasPicklistError = true;
            this.handleError(unexpectedError, 'wiredAssignTypePicklist - unexpected error');
            this._assignTypeOptions = this.getDefaultAssignTypes();
        }
    }

    async connectedCallback() {
        try {
            await this.initializeData();
            this._isInitialized = true;
        } catch (error) {
            this.handleError(error, 'connectedCallback');
            this._isInitialized = true;
        }
    }
    
    disconnectedCallback() {
        try {
            // 메모리 정리
            this._templateOptions = [];
            this._gradeOptions = [];
            this._assessmentTypeOptions = [];
            this._assignTypeOptions = [];
            
            if (this._searchTimeout) {
                clearTimeout(this._searchTimeout);
            }
            
            this.log('disconnectedCallback', 'Memory cleaned up');
        } catch (error) {
            this.handleError(error, 'disconnectedCallback');
        }
    }
    
    getInitialFormData() {
        try {
            return {
                masterName: '',
                isActive: true,
                startDate: '',
                endDate: '',
                description: '',
                assessmentTemplateId: '',
                assessmentGradeId: '',
                assessmentType: '',
                assignType: '',
                contactSearchTerm: '',
                selectedTargets: []
            };
        } catch (error) {
            this.handleError(error, 'getInitialFormData');
            return {};
        }
    }
    
    async initializeData() {
        try {
            this.isLoading = true;
            
            const [templates, grades] = await Promise.all([
                getAssessmentTemplates(),
                getAssessmentGrades()
            ]);
            
            this._templateOptions = (templates || []).map(template => ({
                value: template.Id,
                label: template.Name,
                description: template.Description__c
            }));
            
            this._gradeOptions = (grades || []).map(grade => ({
                value: grade.Id,
                label: grade.Name
            }));
            
            this.log('Initial data loaded', {
                templatesCount: this._templateOptions.length,
                gradesCount: this._gradeOptions.length
            });
            
        } catch (error) {
            this.handleError(error, 'initializeData');
            this._templateOptions = [];
            this._gradeOptions = [];
            this.showToast('Warning', 'Could not load template and grade data. You can still create the assessment master.', 'warning');
        } finally {
            try {
                this.isLoading = false;
            } catch (error) {
                this.handleError(error, 'initializeData - finally block');
            }
        }
    }
    
    updateFormData(updates) {
        try {
            if (!updates || typeof updates !== 'object') {
                throw new Error('Invalid updates object');
            }
            
            this.formData = {
                ...this.formData,
                ...updates
            };
            
            this.log('Form data updated', updates);
        } catch (error) {
            this.handleError(error, 'updateFormData');
        }
    }
    
    handleFieldChange(event) {
        try {
            if (!event || !event.target) {
                throw new Error('Invalid event object');
            }
            
            const fieldName = event.target.dataset?.field;
            if (!fieldName) {
                throw new Error('Field name not found in dataset');
            }
            
            let value = event.target.value;
            
            if (event.target.type === 'checkbox') {
                value = event.target.checked;
            }
            
            this.log('Field change', { fieldName, value });
            
            this.updateFormData({ [fieldName]: value });
            
            this.handleSpecialFieldChanges(fieldName, value);
            
        } catch (error) {
            this.handleError(error, 'handleFieldChange');
        }
    }
    
    handleSpecialFieldChanges(fieldName, value) {
        try {
            switch (fieldName) {
                case 'assignType':
                    this.handleAssignTypeChange(value);
                    break;
                default:

                    break;
            }
        } catch (error) {
            this.handleError(error, `handleSpecialFieldChanges - ${fieldName}`);
        }
    }
    
    handleAssignTypeChange(assignType) {
        try {
            if (assignType !== ASSIGN_TYPE_MANUAL) {
                this.updateFormData({
                    contactSearchTerm: '',
                    selectedTargets: []
                });
                this.searchResults = [];
            }
        } catch (error) {
            this.handleError(error, 'handleAssignTypeChange');
        }
    }
    
    handleContactSearch(event) {
        try {
            const searchTerm = event.target.value;
            this.updateFormData({ contactSearchTerm: searchTerm });
            
            this.log('Contact search term:', searchTerm);
            
            if (this._searchTimeout) {
                clearTimeout(this._searchTimeout);
            }
            
            if (searchTerm.length >= 2) {
                this._searchTimeout = setTimeout(() => {
                    this.performContactSearch(searchTerm);
                }, SEARCH_DEBOUNCE_DELAY);
            } else {
                this.searchResults = [];
            }
        } catch (error) {
            this.handleError(error, 'handleContactSearch');
        }
    }
    
    async performContactSearch(searchTerm) {
        if (!searchTerm) {
            this.log('performContactSearch', 'No searchTerm provided');
            return;
        }
        
        try {
            this.log('Performing contact search for:', searchTerm);
            
            const results = await searchContacts({ searchTerm: searchTerm });
            
            if (!Array.isArray(results)) {
                this.log('Warning: searchContacts returned non-array', results);
                this.searchResults = [];
            } else {
                this.searchResults = results.map(contact => ({
                    id: contact.Id,
                    name: contact.Name,
                    email: contact.Email || '',
                    account: contact.Account?.Name || ''
                }));
            }
            
            this.log('Contact search results:', this.searchResults.length);
            
        } catch (error) {
            this.handleError(error, 'performContactSearch');
            this.searchResults = [];
            this.showToast('Warning', 'Could not search contacts.', 'warning');
        }
    }
    
    selectContact(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const contactId = event.currentTarget?.dataset?.contactId || event.target?.dataset?.contactId;
            if (!contactId) {
                throw new Error('Contact ID not found');
            }
            
            const selectedContact = this.searchResults.find(contact => contact.id === contactId);
            
            if (selectedContact) {
                const alreadySelected = this.formData.selectedTargets.find(target => target.id === contactId);
                if (!alreadySelected) {
                    const newTargets = [...(this.formData.selectedTargets || []), selectedContact];
                    this.updateFormData({ selectedTargets: newTargets });
                    this.log('Contact selected:', selectedContact);
                } else {
                    this.showToast('Warning', 'This contact is already selected.', 'warning');
                }
                
                this.updateFormData({ contactSearchTerm: '' });
                this.searchResults = [];
            }
        } catch (error) {
            this.handleError(error, 'selectContact');
        }
    }
    
    removeTarget(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const contactId = event.currentTarget?.dataset?.contactId || event.target?.dataset?.contactId;
            if (!contactId) {
                throw new Error('Contact ID not found');
            }
            
            const newTargets = this.formData.selectedTargets.filter(target => target.id !== contactId);
            this.updateFormData({ selectedTargets: newTargets });
            
            this.log('Target removed:', contactId);
        } catch (error) {
            this.handleError(error, 'removeTarget');
        }
    }
    
    validateForm() {
        try {
            const errors = [];
            
            if (!this.formData.masterName?.trim()) {
                errors.push('Master Name is required.');
            }
            
            if (!this.formData.startDate) {
                errors.push('Start Date is required.');
            }
            
            if (!this.formData.endDate) {
                errors.push('End Date is required.');
            }
            
            if (!this.formData.assessmentTemplateId) {
                errors.push('Assessment Template is required.');
            }
            
            if (!this.formData.assessmentGradeId) {
                errors.push('Assessment Grade is required.');
            }
            
            if (!this.formData.assessmentType) {
                errors.push('Assessment Type is required.');
            }
            
            if (!this.formData.assignType) {
                errors.push('Assign Type is required.');
            }
            
            if (this.formData.assignType === ASSIGN_TYPE_MANUAL && 
                (!this.formData.selectedTargets || this.formData.selectedTargets.length === 0)) {
                errors.push('Assessment Target is required when Assign Type is Manual.');
            }
            
            if (this.formData.startDate && this.formData.endDate) {
                const startDate = new Date(this.formData.startDate);
                const endDate = new Date(this.formData.endDate);
                
                if (startDate > endDate) {
                    errors.push('Start Date cannot be later than End Date.');
                }
            }
            
            this.log('Form validation result', { errorCount: errors.length, errors });
            return errors;
        } catch (error) {
            this.handleError(error, 'validateForm');
            return ['Form validation error occurred.'];
        }
    }
    
    async handleSave() {
        try {
            
            if (this.isLoading) {
                return;
            }
            
            const result = await this.saveMaster();
            if (result?.success) {
                this.close(result);
            }
        } catch (error) {
            this.handleError(error, 'handleSave');
        }
    }
    
    async saveMaster() {
        try {
            const validationErrors = this.validateForm();
            
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(' '), 'error');
                return { success: false };
            }
            
            this.isLoading = true;
            
            const masterData = this.buildMasterData();
            if (!masterData) {
                throw new Error('Failed to build master data');
            }
            
            const response = await createAssessmentMaster({ 
                masterData: JSON.stringify(masterData) 
            });
            
            if (!response) {
                throw new Error('No response from server');
            }
            
            let result;
            try {
                result = JSON.parse(response);
            } catch (parseError) {
                throw new Error(`Failed to parse server response: ${parseError.message}`);
            }
            
            if (result.success) {
                return await this.handleSaveSuccess(result);
            } else {
                this.showToast('Error', result.message || 'Unknown server error', 'error');
                return { success: false };
            }
            
        } catch (error) {
            this.handleError(error, 'saveMaster');
            return { success: false };
        } finally {
            try {
                this.isLoading = false;
            } catch (error) {
                this.handleError(error, 'saveMaster - finally block');
            }
        }
    }
    
    buildMasterData() {
        try {
            const data = {
                masterName: this.formData.masterName || '',
                isActive: Boolean(this.formData.isActive),
                startDate: this.formData.startDate || '',
                endDate: this.formData.endDate || '',
                assessmentTemplateId: this.formData.assessmentTemplateId || '',
                assessmentGradeId: this.formData.assessmentGradeId || '',
                description: this.formData.description || '',
                assessmentType: this.formData.assessmentType || '',
                assignType: this.formData.assignType || '',
                targets: []
            };
            
            // 타겟 처리
            if (this.formData.selectedTargets && Array.isArray(this.formData.selectedTargets)) {
                try {
                    data.targets = this.formData.selectedTargets.map(target => ({
                        contactId: target.id,
                        targetName: target.name
                    }));
                } catch (targetError) {
                    this.handleError(targetError, 'buildMasterData - targets');
                    data.targets = [];
                }
            }
            
            return data;
        } catch (error) {
            this.handleError(error, 'buildMasterData');
            return null;
        }
    }
    
    async handleSaveSuccess(result) {
        try {
            const message = result.message || 'Assessment Master saved successfully';
            this.showToast('Success', message, 'success');
            
            return { 
                success: true,
                action: 'save',
                masterId: result.masterId || null 
            };
        } catch (error) {
            this.handleError(error, 'handleSaveSuccess');
            return { success: false };
        }
    }
    
    handleCancel() {
        try {
            this.log('Cancel clicked');
            this.close({ action: 'cancel', success: false });
        } catch (error) {
            this.handleError(error, 'handleCancel');
            try {
                this.close({ action: 'force_close', success: false });
            } catch (forceError) {
                this.handleError(forceError, 'handleCancel - force close');
            }
        }
    }
    
    log(message, data) {
        try {
            if (DEBUG) {
                console.log(`[DkeduAssessmentMasterModal] ${message}`, data || '');
            }
        } catch (error) {
            console.error('Logging error:', error);
        }
    }
    
    handleError(error, context) {
        try {
            this.log(`Error in ${context}`, error);
            
            let message = 'An unexpected error occurred.';
            
            if (error?.body?.message) {
                message = error.body.message;
            } else if (error?.message) {
                message = error.message;
            } else if (typeof error === 'string') {
                message = error;
            }
            
            if (DEBUG) {
                message = `${context}: ${message}`;
            }
            
            this.showToast('Error', message, 'error');
            
        } catch (handlerError) {
            console.error('Error in error handler:', handlerError);
            console.error('Original error:', error);
            
            try {
                this.showToast('Critical Error', 'A critical error occurred. Please refresh the page.', 'error');
            } catch (toastError) {
                console.error('Toast error:', toastError);
            }
        }
    }
    
    showToast(title, message, variant) {
        try {
            if (!title || !message || !variant) {
                throw new Error('Invalid toast parameters');
            }
            
            const toast = new ShowToastEvent({ 
                title, 
                message, 
                variant,
                mode: variant === 'error' ? 'sticky' : 'dismissable'
            });
            
            this.dispatchEvent(toast);
            
        } catch (error) {
            console.error('Error showing toast:', error);
            console.log(`${variant.toUpperCase()}: ${title} - ${message}`);
        }
    }
}