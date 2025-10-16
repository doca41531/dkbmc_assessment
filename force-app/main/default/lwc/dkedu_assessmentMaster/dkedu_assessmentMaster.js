/**
 * @description       : Assessment Master Modal Component - DKEDU (Complete Fixed Version)
 * @author            : developer@company.com
 * @group             : DKEDU Components  
 * @created date      : 2025-01-15
 * @last modified on  : 2025-10-16
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 1.3.0
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

export default class Dkedu_assessmentMaster extends NavigationMixin(LightningElement) {
    
    static DEBUG = true;
    _hasInitialized = false;
    
    @api recordId;
    @api objectApiName;
    
    // Form data properties - 각각 독립적으로 관리
    @track masterName = '';
    @track isActive = true;
    @track startDate = '';
    @track endDate = '';
    @track selectedTemplate = null;
    @track selectedTemplateId = '';
    @track selectedGrade = null;
    @track selectedGradeId = '';
    @track description = '';
    @track selectedAssessmentType = '';
    @track selectedAssignType = '';
    
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
    
    // Debounce timer
    searchTimeout;
    
    // Object info
    objectInfo;
    
    // Data backup for state preservation
    @track _formData = {};
    
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_MASTER_OBJECT })
    objectInfoHandler({ data, error }) {
        if (data) {
            this.objectInfo = data;
        } else if (error) {
            this.errorHandler(error, 'objectInfoHandler');
        }
    }
    
    @wire(getPicklistValues, { recordTypeId: '$objectInfo.defaultRecordTypeId', fieldApiName: ASSESSMENT_TYPE_FIELD })
    assessmentTypePicklistHandler({ data, error }) {
        if (data) {
            this.assessmentTypeOptions = data.values.map(option => ({
                label: option.label,
                value: option.value
            }));
            this.filteredAssessmentTypeOptions = [...this.assessmentTypeOptions];
        } else if (error) {
            this.errorHandler(error, 'assessmentTypePicklistHandler');
        }
    }
    
    @wire(getPicklistValues, { recordTypeId: '$objectInfo.defaultRecordTypeId', fieldApiName: ASSIGN_TYPE_FIELD })
    assignTypePicklistHandler({ data, error }) {
        if (data) {
            this.assignTypeOptions = data.values.map(option => ({
                label: option.label,
                value: option.value
            }));
            this.filteredAssignTypeOptions = [...this.assignTypeOptions];
        } else if (error) {
            this.errorHandler(error, 'assignTypePicklistHandler');
        }
    }
    
    // Getters
    get isManualAssign() {
        return this.selectedAssignType === 'Manual';
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
    
    // Utility methods
    log(msg, variable) {
        if (Dkedu_assessmentMaster.DEBUG) {
            console.log(`[Dkedu_assessmentMaster] ${msg}`, variable === undefined ? '' : 
                (typeof variable === 'object' ? JSON.stringify(variable, null, 2) : variable));
        }
    }

    errorHandler(error, from = 'Dkedu_assessmentMaster') {
        this.log('Error occurred', { from, error });
        let message = 'Unknown error occurred.';
        
        if (error.body && error.body.message) {
            message = error.body.message;
        } else if (error.message) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        }
        
        this.showToast('Error', `${from}: ${message}`, 'error');
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
    
    // ========== FORM RESET AND INITIALIZATION ==========
    
    // 완전한 폼 초기화 메서드
    resetFormData() {
        this.log('=== RESETTING FORM DATA ===');
        
        // 기본 폼 데이터 초기화
        this.masterName = '';
        this.isActive = true;
        this.startDate = '';
        this.endDate = '';
        this.description = '';
        
        // 템플릿 관련 초기화
        this.selectedTemplate = null;
        this.selectedTemplateId = '';
        this.templateSearchTerm = '';
        this.isTemplateDropdownOpen = false;
        
        // 등급 관련 초기화
        this.selectedGrade = null;
        this.selectedGradeId = '';
        this.gradeSearchTerm = '';
        this.isGradeDropdownOpen = false;
        
        // 평가 타입 관련 초기화
        this.selectedAssessmentType = '';
        this.assessmentTypeSearchTerm = '';
        this.isAssessmentTypeDropdownOpen = false;
        
        // 할당 타입 관련 초기화
        this.selectedAssignType = '';
        this.assignTypeSearchTerm = '';
        this.isAssignTypeDropdownOpen = false;
        
        // 연락처 관련 초기화
        this.selectedTargets = [];
        this.searchResults = [];
        this.contactSearchTerm = '';
        this.isContactDropdownOpen = false;
        this.hasSearchedContacts = false;
        
        // UI 상태 초기화
        this.isLoading = false;
        this._formData = {};
        
        // 필터된 옵션들 초기화
        this.filteredTemplateOptions = [...this.templateOptions];
        this.filteredGradeOptions = [...this.gradeOptions];
        this.filteredAssessmentTypeOptions = [...this.assessmentTypeOptions];
        this.filteredAssignTypeOptions = [...this.assignTypeOptions];
        
        this.log('Form data reset completed');
    }
    
    // DOM 요소 직접 초기화 (렌더링 후 실행)
    resetDOMElements() {
        try {
            this.log('Resetting DOM elements');
            
            // 모든 입력 필드 초기화
            const inputs = this.template.querySelectorAll('input[data-field]');
            inputs.forEach(input => {
                if (input.type === 'checkbox') {
                    input.checked = input.dataset.field === 'isActive' ? true : false;
                } else {
                    input.value = '';
                }
            });
            
            // Textarea 초기화
            const textareas = this.template.querySelectorAll('lightning-textarea[data-field]');
            textareas.forEach(textarea => {
                textarea.value = '';
            });
            
            // 드롭다운 상태 초기화
            const dropdowns = this.template.querySelectorAll('.slds-combobox');
            dropdowns.forEach(dropdown => {
                dropdown.setAttribute('aria-expanded', 'false');
            });
            
            this.log('DOM elements reset completed');
            
        } catch (error) {
            this.log('Error resetting DOM elements:', error);
        }
    }
    
    // 데이터 백업 및 복원 메서드
    backupFormData() {
        this._formData = {
            masterName: this.masterName,
            isActive: this.isActive,
            startDate: this.startDate,
            endDate: this.endDate,
            description: this.description,
            selectedTemplateId: this.selectedTemplateId,
            selectedGradeId: this.selectedGradeId,
            selectedAssessmentType: this.selectedAssessmentType,
            selectedAssignType: this.selectedAssignType,
            templateSearchTerm: this.templateSearchTerm,
            gradeSearchTerm: this.gradeSearchTerm,
            assessmentTypeSearchTerm: this.assessmentTypeSearchTerm,
            assignTypeSearchTerm: this.assignTypeSearchTerm,
            selectedTemplate: this.selectedTemplate,
            selectedGrade: this.selectedGrade
        };
        this.log('Form data backed up', this._formData);
    }
    
    restoreFormData() {
        if (this._formData && Object.keys(this._formData).length > 0) {
            Object.keys(this._formData).forEach(key => {
                if (this._formData[key] !== undefined) {
                    this[key] = this._formData[key];
                }
            });
            this.log('Form data restored', this._formData);
        }
    }
    
    @api
    openModal() {
        this.log('=== OPENING MODAL ===');
        this._hasInitialized = false;
        
        // 폼 완전 초기화
        this.resetFormData();
        
        // 렌더링 키 업데이트 (강제 리렌더링)
        this.renderKey = this.renderKey + 1;
        
        // 초기 데이터 로드
        this.loadInitialData();
        
        this.log('Modal opened and initialized');
    }
    
    // Component lifecycle
    connectedCallback() {
        this.log('Component connected');
        this.loadInitialData();
    }
    
    renderedCallback() {
        if (!this._hasInitialized) {
            this.log('First render initialization');
            this._hasInitialized = true;
            
            // DOM 초기화
            setTimeout(() => {
                this.resetDOMElements();
            }, 100);
            
        } else {
            // 폼 값 동기화 (필요시에만)
            if (this.masterName || this.startDate || this.endDate) {
                this.syncFormValues();
            }
        }
    }

    disconnectedCallback() {
        this.log('Component disconnected - cleaning up');
        this._hasInitialized = false;
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // 모든 상태 정리
        this.resetFormData();
    }
    
    // 폼 값 동기화
    syncFormValues() {
        try {
            // DOM 요소들과 컴포넌트 상태 동기화
            const masterNameInput = this.template.querySelector('[data-field="masterName"]');
            if (masterNameInput) {
                masterNameInput.value = this.masterName;
            }
            
            const startDateInput = this.template.querySelector('[data-field="startDate"]');
            if (startDateInput) {
                startDateInput.value = this.startDate;
            }
            
            const endDateInput = this.template.querySelector('[data-field="endDate"]');
            if (endDateInput) {
                endDateInput.value = this.endDate;
            }
            
            const isActiveCheckbox = this.template.querySelector('[data-field="isActive"]');
            if (isActiveCheckbox) {
                isActiveCheckbox.checked = this.isActive;
            }
            
            this.log('Form values synchronized');
        } catch (error) {
            this.log('Error syncing form values:', error);
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
            this.errorHandler(error, 'loadInitialData');
        }
    }
    
    // ========== EVENT HANDLERS ==========
    
    // 일반 입력 필드 처리 (text inputs)
    handleInputChange(event) {
        const fieldName = event.target.dataset.field || event.target.name || event.target.id;
        const value = event.target.value;
        
        this.log(`handleInputChange - ${fieldName}:`, value);
        
        // 데이터 백업
        this.backupFormData();
        
        // Map field names to component properties
        switch(fieldName) {
            case 'masterName':
                this.masterName = value;
                break;
            default:
                this.log('Unknown input field in handleInputChange:', fieldName);
        }
        
        this.log(`${fieldName} updated to:`, this[fieldName]);
    }
    
    // 체크박스 처리
    handleCheckboxChange(event) {
        const fieldName = event.target.dataset.field || event.target.name || event.target.id;
        const checked = event.target.checked;
        
        this.log(`handleCheckboxChange - ${fieldName}:`, checked);
        
        // 데이터 백업
        this.backupFormData();
        
        switch(fieldName) {
            case 'isActive':
                this.isActive = checked;
                break;
            default:
                this.log('Unknown checkbox field:', fieldName);
        }
        
        this.log(`${fieldName} updated to:`, this[fieldName]);
    }
    
    // 날짜 필드 처리
    handleDateChange(event) {
        const fieldName = event.target.dataset.field || event.target.name || event.target.id;
        const value = event.target.value;
        
        this.log(`handleDateChange - ${fieldName}:`, value);
        
        // 데이터 백업
        this.backupFormData();
        
        switch(fieldName) {
            case 'startDate':
                this.startDate = value;
                break;
            case 'endDate':
                this.endDate = value;
                break;
            default:
                this.log('Unknown date field:', fieldName);
        }
        
        this.log(`${fieldName} updated to:`, this[fieldName]);
        
        // Validate date range
        if (this.startDate && this.endDate) {
            this.validateDateRange();
        }
    }
    
    // Lightning Textarea 처리
    handleTextareaChange(event) {
        const fieldName = event.target.dataset.field || event.target.name;
        const value = event.target.value;
        
        this.log(`handleTextareaChange - ${fieldName}:`, value);
        
        // 데이터 백업
        this.backupFormData();
        
        switch(fieldName) {
            case 'description':
                this.description = value;
                break;
            default:
                this.log('Unknown textarea field:', fieldName);
        }
        
        this.log(`${fieldName} updated to:`, this[fieldName]);
    }
    
    // ========== TEMPLATE SEARCH AND SELECTION ==========
    
    handleTemplateSearch(event) {
        this.backupFormData();
        this.templateSearchTerm = event.target.value;
        this.isTemplateDropdownOpen = true;
        this.filterTemplateOptions();
    }
    
    filterTemplateOptions() {
        if (!this.templateSearchTerm) {
            this.filteredTemplateOptions = [...this.templateOptions];
        } else {
            const searchTerm = this.templateSearchTerm.toLowerCase();
            this.filteredTemplateOptions = this.templateOptions.filter(template =>
                template.label.toLowerCase().includes(searchTerm) ||
                (template.description && template.description.toLowerCase().includes(searchTerm))
            );
        }
    }
    
    handleTemplateDropdownFocus() {
        this.isTemplateDropdownOpen = true;
    }
    
    handleTemplateDropdownBlur() {
        setTimeout(() => {
            this.isTemplateDropdownOpen = false;
        }, 150);
    }
    
    selectTemplate(event) {
        this.backupFormData();
        const templateId = event.currentTarget.dataset.templateId;
        const selectedTemplate = this.templateOptions.find(t => t.value === templateId);
        
        if (selectedTemplate) {
            this.selectedTemplate = selectedTemplate;
            this.selectedTemplateId = templateId;
            this.templateSearchTerm = selectedTemplate.label;
            this.isTemplateDropdownOpen = false;
            this.log('Template selected', selectedTemplate);
        }
    }
    
    // ========== GRADE SEARCH AND SELECTION ==========
    
    handleGradeSearch(event) {
        this.backupFormData();
        this.gradeSearchTerm = event.target.value;
        this.isGradeDropdownOpen = true;
        this.filterGradeOptions();
    }
    
    filterGradeOptions() {
        if (!this.gradeSearchTerm) {
            this.filteredGradeOptions = [...this.gradeOptions];
        } else {
            const searchTerm = this.gradeSearchTerm.toLowerCase();
            this.filteredGradeOptions = this.gradeOptions.filter(grade =>
                grade.label.toLowerCase().includes(searchTerm)
            );
        }
    }
    
    handleGradeDropdownFocus() {
        this.isGradeDropdownOpen = true;
    }
    
    handleGradeDropdownBlur() {
        setTimeout(() => {
            this.isGradeDropdownOpen = false;
        }, 150);
    }
    
    selectGrade(event) {
        this.backupFormData();
        const gradeId = event.currentTarget.dataset.gradeId;
        const selectedGrade = this.gradeOptions.find(g => g.value === gradeId);
        
        if (selectedGrade) {
            this.selectedGrade = selectedGrade;
            this.selectedGradeId = gradeId;
            this.gradeSearchTerm = selectedGrade.label;
            this.isGradeDropdownOpen = false;
            this.log('Grade selected', selectedGrade);
        }
    }
    
    // ========== ASSESSMENT TYPE SEARCH AND SELECTION ==========
    
    handleAssessmentTypeSearch(event) {
        this.backupFormData();
        this.assessmentTypeSearchTerm = event.target.value;
        this.isAssessmentTypeDropdownOpen = true;
        this.filterAssessmentTypeOptions();
    }
    
    filterAssessmentTypeOptions() {
        if (!this.assessmentTypeSearchTerm) {
            this.filteredAssessmentTypeOptions = [...this.assessmentTypeOptions];
        } else {
            const searchTerm = this.assessmentTypeSearchTerm.toLowerCase();
            this.filteredAssessmentTypeOptions = this.assessmentTypeOptions.filter(type =>
                type.label.toLowerCase().includes(searchTerm)
            );
        }
    }
    
    handleAssessmentTypeDropdownFocus() {
        this.isAssessmentTypeDropdownOpen = true;
    }
    
    handleAssessmentTypeDropdownBlur() {
        setTimeout(() => {
            this.isAssessmentTypeDropdownOpen = false;
        }, 150);
    }
    
    selectAssessmentType(event) {
        this.backupFormData();
        const typeValue = event.currentTarget.dataset.typeValue;
        const selectedType = this.assessmentTypeOptions.find(t => t.value === typeValue);
        
        if (selectedType) {
            this.selectedAssessmentType = typeValue;
            this.assessmentTypeSearchTerm = selectedType.label;
            this.isAssessmentTypeDropdownOpen = false;
            this.log('Assessment type selected', selectedType);
        }
    }
    
    // ========== ASSIGN TYPE SEARCH AND SELECTION ==========
    
    handleAssignTypeSearch(event) {
        this.backupFormData();
        this.assignTypeSearchTerm = event.target.value;
        this.isAssignTypeDropdownOpen = true;
        this.filterAssignTypeOptions();
    }
    
    filterAssignTypeOptions() {
        if (!this.assignTypeSearchTerm) {
            this.filteredAssignTypeOptions = [...this.assignTypeOptions];
        } else {
            const searchTerm = this.assignTypeSearchTerm.toLowerCase();
            this.filteredAssignTypeOptions = this.assignTypeOptions.filter(type =>
                type.label.toLowerCase().includes(searchTerm)
            );
        }
    }
    
    handleAssignTypeDropdownFocus() {
        this.isAssignTypeDropdownOpen = true;
    }
    
    handleAssignTypeDropdownBlur() {
        setTimeout(() => {
            this.isAssignTypeDropdownOpen = false;
        }, 150);
    }
    
    selectAssignType(event) {
        this.backupFormData();
        const assignTypeValue = event.currentTarget.dataset.assignTypeValue;
        const selectedAssignType = this.assignTypeOptions.find(t => t.value === assignTypeValue);
        
        if (selectedAssignType) {
            this.selectedAssignType = assignTypeValue;
            this.assignTypeSearchTerm = selectedAssignType.label;
            this.isAssignTypeDropdownOpen = false;
            
            this.log('Assign type selected', { 
                assignTypeValue, 
                selectedAssignType,
                isManualAssign: assignTypeValue === 'Manual'
            });
            
            // Show/hide contact search based on assign type
            if (assignTypeValue !== 'Manual') {
                this.selectedTargets = [];
                this.searchResults = [];
                this.contactSearchTerm = '';
                this.isContactDropdownOpen = false;
                this.hasSearchedContacts = false;
                this.log('Assign type is not Manual, clearing contact data');
            } else {
                this.log('Assign type is Manual, contact search should be visible');
            }
        }
    }
    
    // ========== DROPDOWN MOUSE HANDLING ==========
    
    handleDropdownMouseEnter() {
        this._isMouseOverDropdown = true;
    }
    
    handleDropdownMouseLeave() {
        this._isMouseOverDropdown = false;
    }
    
    // ========== CONTACT SEARCH FUNCTIONALITY ==========
    
    handleContactSearch(event) {
        this.contactSearchTerm = event.target.value;
        this.isContactDropdownOpen = true;
        this.hasSearchedContacts = true;
        
        this.log('Contact search input changed', {
            contactSearchTerm: this.contactSearchTerm,
            isManualAssign: this.isManualAssign,
            selectedAssignType: this.selectedAssignType,
            searchTermLength: this.contactSearchTerm.length
        });
        
        // Debounce search
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchTimeout = setTimeout(() => {
            if (this.contactSearchTerm.length >= 1) {
                this.log('Initiating contact search', this.contactSearchTerm);
                this.performContactSearch();
            } else {
                this.log('Search term too short, clearing results', this.contactSearchTerm.length);
                this.searchResults = [];
            }
        }, 300);
    }
    
    handleContactDropdownFocus() {
        this.isContactDropdownOpen = true;
        if (this.contactSearchTerm.length >= 1) {
            this.performContactSearch();
        }
    }
    
    handleContactDropdownBlur() {
        setTimeout(() => {
            if (!this._isMouseOverDropdown) {
                this.isContactDropdownOpen = false;
            }
        }, 150);
    }
    
    selectContact(event) {
        const contactId = event.currentTarget.dataset.contactId;
        const contact = this.searchResults.find(c => c.id === contactId);
        
        if (contact && !this.selectedTargets.some(target => target.id === contactId)) {
            this.selectedTargets = [...this.selectedTargets, {
                id: contact.id,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                account: contact.account
            }];
            
            this.contactSearchTerm = '';
            this.searchResults = [];
            this.isContactDropdownOpen = false;
            this.hasSearchedContacts = false;
            
            this.log('Contact selected and added to targets', contact);
        }
    }
    
    async performContactSearch() {
        try {
            this.log('Contact search initiated', { 
                contactSearchTerm: this.contactSearchTerm, 
                isManualAssign: this.isManualAssign,
                selectedAssignType: this.selectedAssignType 
            });
            
            this.isLoading = true;
            const results = await searchContacts({ searchTerm: this.contactSearchTerm });
            
            this.log('Contact search raw results', results);
            
            this.searchResults = results.map(contact => ({
                id: contact.Id,
                name: contact.Name,
                email: contact.Email || '',
                phone: contact.Phone || '',
                account: contact.Account ? contact.Account.Name : '',
                isSelected: this.selectedTargets.some(target => target.id === contact.Id)
            }));
            
            this.log('Contact search processed results', {
                rawResultsCount: results.length,
                processedResultsCount: this.searchResults.length,
                searchResults: this.searchResults
            });
            
        } catch (error) {
            this.log('Contact search error', error);
            this.errorHandler(error, 'performContactSearch');
            this.searchResults = [];
        } finally {
            this.isLoading = false;
        }
    }
    
    handleRemoveTarget(event) {
        const contactId = event.target.dataset.contactId;
        this.selectedTargets = this.selectedTargets.filter(target => target.id !== contactId);
        
        this.searchResults = this.searchResults.map(result => ({
            ...result,
            isSelected: result.id === contactId ? false : result.isSelected
        }));
        
        this.log('Contact removed from targets', contactId);
    }
    
    // ========== VALIDATION METHODS ==========
    
    validateDateRange() {
        if (this.startDate && this.endDate) {
            const start = new Date(this.startDate);
            const end = new Date(this.endDate);
            
            if (start > end) {
                this.showToast('Validation Error', 'Start date cannot be later than end date.', 'error');
                return false;
            }
        }
        return true;
    }
    
    validateForm() {
        const errors = [];
        
        this.log('Validating form with values', {
            masterName: this.masterName,
            startDate: this.startDate,
            endDate: this.endDate,
            selectedTemplateId: this.selectedTemplateId,
            selectedGradeId: this.selectedGradeId,
            selectedAssessmentType: this.selectedAssessmentType,
            selectedAssignType: this.selectedAssignType,
            selectedTargetsLength: this.selectedTargets.length
        });
        
        if (!this.masterName || !this.masterName.trim()) {
            errors.push('Master Name is required.');
        }
        
        if (!this.startDate || this.startDate === '') {
            errors.push('Start Date is required.');
        }
        
        if (!this.endDate || this.endDate === '') {
            errors.push('End Date is required.');
        }
        
        if (!this.selectedTemplateId || this.selectedTemplateId === '') {
            errors.push('Assessment Template is required.');
        }
        
        if (!this.selectedGradeId || this.selectedGradeId === '') {
            errors.push('Assessment Grade is required.');
        }
        
        if (!this.selectedAssessmentType || this.selectedAssessmentType === '') {
            errors.push('Assessment Type is required.');
        }
        
        if (!this.selectedAssignType || this.selectedAssignType === '') {
            errors.push('Assign Type is required.');
        }
        
        if (this.selectedAssignType === 'Manual' && (!this.selectedTargets || this.selectedTargets.length === 0)) {
            errors.push('Assessment Target is required when Assign Type is Manual.');
        }
        
        // Date validation
        if (this.startDate && this.endDate) {
            const startDate = new Date(this.startDate);
            const endDate = new Date(this.endDate);
            
            if (startDate > endDate) {
                errors.push('Start Date cannot be later than End Date.');
            }
        }
        
        this.log('Form validation result', { errorCount: errors.length, errors });
        return errors;
    }
    
    // ========== SAVE METHODS ==========
    
    async handleSave() {
        this.log('=== SAVE PROCESS STARTED ===');
        
        const validationErrors = this.validateForm();
        if (validationErrors.length > 0) {
            this.log('=== VALIDATION FAILED ===', validationErrors);
            this.showToast('Validation Error', validationErrors.join(' '), 'error');
            return;
        }
        
        this.log('=== VALIDATION PASSED ===');
        this.isLoading = true;
        
        try {
            const masterData = this.buildMasterData();
            this.log('Master data prepared', masterData);
            
            const response = await createAssessmentMaster({ masterData: JSON.stringify(masterData) });
            const result = JSON.parse(response);
            this.log('Save result', result);
            
            if (result.success) {
                this.showToast('Success', result.message, 'success');
                
                // 성공 시 폼 완전 초기화 후 모달 닫기
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
            this.errorHandler(error, 'handleSave');
        } finally {
            this.isLoading = false;
        }
    }
    
    handleCancel() {
        this.log('=== CANCEL REQUESTED ===');
        
        // 취소 시에도 폼 완전 초기화
        this.resetFormData();
        this.closeModal();
    }
    
    buildMasterData() {
        return {
            masterName: this.masterName,
            isActive: this.isActive,
            startDate: this.startDate,
            endDate: this.endDate,
            assessmentTemplateId: this.selectedTemplateId,
            assessmentGradeId: this.selectedGradeId,
            description: this.description,
            assessmentType: this.selectedAssessmentType,
            assignType: this.selectedAssignType,
            targets: this.selectedTargets.map(target => ({
                contactId: target.id,
                targetName: target.name
            }))
        };
    }
    
    // ========== NAVIGATION METHODS ==========
    
    navigateToRecord(recordId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                actionName: 'view'
            }
        });
    }
    
    closeModal() {
        this.log('=== CLOSING MODAL ===');
        
        // 모달 닫기 전 완전 초기화
        this.resetFormData();
        
        const closeEvent = new CustomEvent('close', {
            detail: { reason: 'Modal closed' }
        });
        this.dispatchEvent(closeEvent);
        
        // If no parent component to handle the event, navigate to list view
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
        }, 100);
    }
    
    // ========== API METHODS FOR EXTERNAL ACCESS ==========
    
    @api
    getCurrentFormData() {
        return {
            masterName: this.masterName,
            isActive: this.isActive,
            startDate: this.startDate,
            endDate: this.endDate,
            description: this.description,
            selectedTemplateId: this.selectedTemplateId,
            selectedGradeId: this.selectedGradeId,
            selectedAssessmentType: this.selectedAssessmentType,
            selectedAssignType: this.selectedAssignType,
            selectedTargets: this.selectedTargets
        };
    }
    
    @api
    setFormData(formData) {
        if (formData) {
            this.masterName = formData.masterName || '';
            this.isActive = formData.isActive !== undefined ? formData.isActive : true;
            this.startDate = formData.startDate || '';
            this.endDate = formData.endDate || '';
            this.description = formData.description || '';
            this.selectedTemplateId = formData.selectedTemplateId || '';
            this.selectedGradeId = formData.selectedGradeId || '';
            this.selectedAssessmentType = formData.selectedAssessmentType || '';
            this.selectedAssignType = formData.selectedAssignType || '';
            this.selectedTargets = formData.selectedTargets || [];
            
            this.log('Form data set from external source', formData);
            
            // Sync UI after setting data
            setTimeout(() => {
                this.syncFormValues();
            }, 100);
        }
    }
    
    @api
    forceReset() {
        this.log('=== FORCE RESET REQUESTED ===');
        
        // 상태 초기화
        this.resetFormData();
        
        // 렌더링 키 증가로 강제 리렌더링
        this.renderKey = this.renderKey + 1;
        
        // DOM 초기화
        setTimeout(() => {
            this.resetDOMElements();
        }, 200);
        
        this.log('Force reset completed');
    }
    
    @api
    resetComponent() {
        this.log('Resetting component to initial state');
        this.resetFormData();
        this.renderKey = this.renderKey + 1;
        this.loadInitialData();
    }
    
    // ========== DEBUG METHODS ==========
    
    @api
    async testContactSearch() {
        this.log('Testing contact search manually');
        
        this.selectedAssignType = 'Manual';
        this.assignTypeSearchTerm = 'Manual';
        
        try {
            console.log('=== DIRECT CONTACT SEARCH TEST ===');
            const testResults = await searchContacts({ searchTerm: '김' });
            console.log('Direct search results:', testResults);
            console.log('Results count:', testResults.length);
            
            if (testResults.length > 0) {
                console.log('First contact:', testResults[0]);
                console.log('Contact name:', testResults[0].Name);
                console.log('Contact email:', testResults[0].Email);
            }
            
            this.contactSearchTerm = '김';
            this.searchResults = testResults.map(contact => ({
                id: contact.Id,
                name: contact.Name,
                email: contact.Email || '',
                phone: contact.Phone || '',
                account: contact.Account ? contact.Account.Name : '',
                isSelected: false
            }));
            
            console.log('Processed results:', this.searchResults);
            console.log('hasSearchResults:', this.hasSearchResults);
            console.log('isManualAssign:', this.isManualAssign);
            
        } catch (error) {
            console.error('Direct search error:', error);
            this.errorHandler(error, 'testContactSearch');
        }
    }
    
    @api  
    debugCurrentState() {
        const state = {
            masterName: this.masterName,
            isActive: this.isActive,
            startDate: this.startDate,
            endDate: this.endDate,
            selectedAssignType: this.selectedAssignType,
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
    }
}