/**
 * @description       : Lightning Modal Assessment Question Component
 * @author            : Salesforce Consultant
 * @last modified on  : 2025-11-17
**/
import { api, track, wire } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

// Schema Imports
import ASSESSMENT_QUESTION_OBJECT from '@salesforce/schema/AssessmentQuestion__c';
import TYPE_FIELD from '@salesforce/schema/AssessmentQuestion__c.Type__c';

// Apex Methods
import createAssessmentQuestion from '@salesforce/apex/DKEDU_AssessmentQuestionController.createAssessmentQuestion';
import getAssessmentQuestions from '@salesforce/apex/DKEDU_AssessmentQuestionController.getAssessmentQuestions';
import getAssessmentQuestionItems from '@salesforce/apex/DKEDU_AssessmentQuestionController.getAssessmentQuestionItems';

const DEBUG = true;
const CHOICE_BASED_TYPES = ['Multiple Choice', 'Choosable', 'Multi Choosable'];

export default class DkeduAssessmentQuestionModal extends LightningModal {
    @api parentRecordId;
    
    // 핵심 상태만 track으로 관리
    @track isLoading = false;
    @track isLoadingChoices = false;
    @track formData = {
        questionType: '',
        questionText: '',
        choiceOptions: [],
        isRelatedQuestionEnabled: false,
        isImageEnabled: false,
        selectedParentQuestionId: '',
        selectedConditionValue: ''
    };
    
    // 캐시된 데이터
    _objectInfo = null;
    _parentQuestions = [];
    _parentQuestionItems = [];
    _questionTypeOptions = [];
    _isInitialized = false;
    _hasObjectInfoError = false;
    _hasPicklistError = false;
    
    // Parent question search state
    @track parentQuestionSearchTerm = '';
    @track filteredParentQuestions = [];
    @track showParentQuestionResults = false;
    
    // Lightning Record Picker configuration for Parent Question
    // Question__c is Text(255) which is supported in matching-info
    displayInfo = {
        primaryField: 'Question__c', // Display Question text
        additionalFields: ['Name'] // Show Question Number as well
    };

    matchingInfo = {
        primaryField: { fieldPath: 'Question__c' }, // Search by Question text (Text field - supported)
        additionalFields: [{ fieldPath: 'Name' }] // Also search by Name
    };
    
    // Computed properties using getters
    get questionTypeOptions() {
        try {
            return this._questionTypeOptions.length > 0 ? this._questionTypeOptions : this.getDefaultQuestionTypes();
        } catch (error) {
            this.handleError(error, 'questionTypeOptions getter');
            return this.getDefaultQuestionTypes();
        }
    }
    
    get showChoiceOptions() {
        try {
            return CHOICE_BASED_TYPES.includes(this.formData.questionType);
        } catch (error) {
            this.handleError(error, 'showChoiceOptions getter');
            return false;
        }
    }
    
    get isOnlyOneChoice() {
        try {
            return this.formData.choiceOptions?.length <= 1;
        } catch (error) {
            this.handleError(error, 'isOnlyOneChoice getter');
            return true;
        }
    }
    
    get parentQuestionOptions() {
        try {
            if (!Array.isArray(this._parentQuestions)) {
                return [];
            }
            return this._parentQuestions.map(question => ({
                value: question.Id,
                label: question.Question__c || question.Name || 'Unnamed Question'
            }));
        } catch (error) {
            this.handleError(error, 'parentQuestionOptions getter');
            return [];
        }
    }
    
    get selectedParentQuestionLabel() {
        try {
            if (!this.formData.selectedParentQuestionId) return '';
            const question = this._parentQuestions.find(q => q.Id === this.formData.selectedParentQuestionId);
            return question ? (question.Question__c || question.Name || 'Unnamed Question') : '';
        } catch (error) {
            this.handleError(error, 'selectedParentQuestionLabel getter');
            return '';
        }
    }
    
    get noParentQuestionResults() {
        try {
            return this.filteredParentQuestions.length === 0 && this.parentQuestionSearchTerm.trim().length > 0;
        } catch (error) {
            this.handleError(error, 'noParentQuestionResults getter');
            return false;
        }
    }
    
    get isParentQuestionChoiceBased() {
        try {
            if (!this.formData.selectedParentQuestionId) return false;
            
            const selectedQuestion = this._parentQuestions.find(
                q => q.Id === this.formData.selectedParentQuestionId
            );
            
            return selectedQuestion && CHOICE_BASED_TYPES.includes(selectedQuestion.Type__c);
        } catch (error) {
            this.handleError(error, 'isParentQuestionChoiceBased getter');
            return false;
        }
    }
    
    get parentQuestionChoices() {
        try {
            if (!Array.isArray(this._parentQuestionItems)) {
                return [];
            }
            return this._parentQuestionItems.map(item => ({
                value: item.Content__c || '',
                label: item.Content__c || 'Unnamed Option'
            }));
        } catch (error) {
            this.handleError(error, 'parentQuestionChoices getter');
            return [];
        }
    }
    
    getDefaultQuestionTypes() {
        try {
            return [
                { label: 'Multiple Choice', value: 'Multiple Choice' },
                { label: 'True/False', value: 'True/False' },
                { label: 'Short Answer', value: 'Short Answer' },
                { label: 'Essay', value: 'Essay' }
            ];
        } catch (error) {
            this.handleError(error, 'getDefaultQuestionTypes');
            return [];
        }
    }
    
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_QUESTION_OBJECT })
    wiredObjectInfo({ data, error }) {
        try {
            if (data) {
                this._objectInfo = data;
                this._hasObjectInfoError = false;
                this.log('Object info loaded', data);
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
        fieldApiName: TYPE_FIELD 
    })
    wiredTypePicklist({ data, error }) {
        try {
            if (data && this._objectInfo && !this._hasObjectInfoError) {
                this._questionTypeOptions = data.values.map(option => ({
                    value: option.value || '',
                    label: option.label || option.value || 'Unknown'
                }));
                this._hasPicklistError = false;
                this.log('Picklist loaded', data.values);
            } else if (error) {
                this._hasPicklistError = true;
                this.handleError(error, 'wiredTypePicklist');
                this._questionTypeOptions = this.getDefaultQuestionTypes();
            }
        } catch (unexpectedError) {
            this._hasPicklistError = true;
            this.handleError(unexpectedError, 'wiredTypePicklist - unexpected error');
            this._questionTypeOptions = this.getDefaultQuestionTypes();
        }
    }
    
    // Lifecycle
    async connectedCallback() {
        try {
            this.log('connectedCallback', 'Starting');
            
            await this.initializeData();
            this._isInitialized = true;
            
            this.log('connectedCallback', 'Completed successfully');
        } catch (error) {
            this.handleError(error, 'connectedCallback');
            this._isInitialized = true;
        }
    }
    
    disconnectedCallback() {
        try {
            this._parentQuestions = [];
            this._parentQuestionItems = [];
            this._questionTypeOptions = [];
            this.log('disconnectedCallback', 'Memory cleaned up');
        } catch (error) {
            this.handleError(error, 'disconnectedCallback');
        }
    }
    
    getInitialFormData() {
        try {
            return {
                questionType: '',
                questionText: '',
                choiceOptions: [],
                isRelatedQuestionEnabled: false,
                isImageEnabled: false,
                selectedParentQuestionId: '',
                selectedConditionValue: ''
            };
        } catch (error) {
            this.handleError(error, 'getInitialFormData');
            return {};
        }
    }

    async initializeData() {
        try {
            this.isLoading = true;
            this._parentQuestions = await getAssessmentQuestions();
            
            if (!Array.isArray(this._parentQuestions)) {
                this._parentQuestions = [];
                this.log('Warning: getAssessmentQuestions returned non-array');
            }
            
            this.log('Parent questions loaded', this._parentQuestions.length);
        } catch (error) {
            this.handleError(error, 'initializeData');
            this._parentQuestions = [];
            this.showToast('Warning', 'Could not load parent questions. You can still create new questions.', 'warning');
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
    
    // Event handlers
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
            
            // 상태 업데이트
            this.updateFormData({ [fieldName]: value });
            
            // 특별 처리
            this.handleSpecialFieldChanges(fieldName, value);
            
        } catch (error) {
            this.handleError(error, 'handleFieldChange');
        }
    }
    
    handleSpecialFieldChanges(fieldName, value) {
        try {
            switch (fieldName) {
                case 'questionType':
                    this.handleQuestionTypeChange();
                    break;
                case 'isRelatedQuestionEnabled':
                    this.handleRelatedQuestionToggle(value);
                    break;
                case 'selectedParentQuestionId':
                    this.handleParentQuestionChange(value);
                    break;
                default:
                    // No special handling needed
                    break;
            }
        } catch (error) {
            this.handleError(error, `handleSpecialFieldChanges - ${fieldName}`);
        }
    }
    
    handleQuestionTypeChange() {
        try {
            if (this.showChoiceOptions && (!this.formData.choiceOptions || this.formData.choiceOptions.length === 0)) {
                this.initializeChoiceOptions();
            } else if (!this.showChoiceOptions) {
                this.updateFormData({ choiceOptions: [] });
            }
        } catch (error) {
            this.handleError(error, 'handleQuestionTypeChange');
        }
    }
    
    handleRelatedQuestionToggle(enabled) {
        try {
            if (!enabled) {
                this.updateFormData({
                    selectedParentQuestionId: '',
                    selectedConditionValue: ''
                });
                this._parentQuestionItems = [];
                this.parentQuestionSearchTerm = '';
                this.filteredParentQuestions = [];
                this.showParentQuestionResults = false;
            }
        } catch (error) {
            this.handleError(error, 'handleRelatedQuestionToggle');
        }
    }
    
    async handleParentQuestionChange(questionId) {
        try {
            // 이전 상태 정리
            this._parentQuestionItems = [];
            this.updateFormData({ selectedConditionValue: '' });
            
            if (questionId && this.isParentQuestionChoiceBased) {
                await this.loadParentQuestionItems(questionId);
            }
        } catch (error) {
            this.handleError(error, 'handleParentQuestionChange');
        }
    }
    
    // Lightning Record Picker Handler for Parent Question
    handleParentQuestionPickerChange(event) {
        try {
            const questionId = event.detail.recordId;
            this.log('Parent question picker changed', questionId);
            
            if (questionId) {
                this.updateFormData({ selectedParentQuestionId: questionId });
                // Trigger parent question change handler to load items
                this.handleParentQuestionChange(questionId);
            } else {
                // Cleared selection
                this.updateFormData({ 
                    selectedParentQuestionId: '',
                    selectedConditionValue: ''
                });
                this._parentQuestionItems = [];
            }
        } catch (error) {
            this.handleError(error, 'handleParentQuestionPickerChange');
        }
    }
    
    // Parent Question Search Handlers (legacy - can be removed if not needed)
    handleParentQuestionSearch(event) {
        try {
            const searchTerm = event.target.value || '';
            this.parentQuestionSearchTerm = searchTerm;
            
            // Filter parent questions based on search term
            const options = this.parentQuestionOptions;
            
            if (searchTerm.trim().length === 0) {
                // 빈값일 때는 전체 목록 표시
                this.filteredParentQuestions = options;
            } else {
                // 검색어가 있을 때는 필터링
                this.filteredParentQuestions = options.filter(option => 
                    option.label.toLowerCase().includes(searchTerm.toLowerCase())
                );
            }
            
            this.showParentQuestionResults = true;
            this.log('Parent question search', { searchTerm, resultsCount: this.filteredParentQuestions.length });
        } catch (error) {
            this.handleError(error, 'handleParentQuestionSearch');
        }
    }
    
    selectParentQuestion(event) {
        try {
            event.preventDefault();
            event.stopPropagation();

            const questionId = event.currentTarget.dataset.questionId;
            if (!questionId) return;
            
            this.updateFormData({ selectedParentQuestionId: questionId });
            this.parentQuestionSearchTerm = '';
            this.filteredParentQuestions = [];
            this.showParentQuestionResults = false;
            
            // Trigger parent question change handler
            this.handleParentQuestionChange(questionId);
            
            this.log('Parent question selected', questionId);
        } catch (error) {
            this.handleError(error, 'selectParentQuestion');
        }
    }
    
    clearParentQuestionSelection() {
        try {
            this.updateFormData({ 
                selectedParentQuestionId: '',
                selectedConditionValue: ''
            });
            this.parentQuestionSearchTerm = '';
            this.filteredParentQuestions = [];
            this.showParentQuestionResults = false;
            this._parentQuestionItems = [];
            
            this.log('Parent question selection cleared');
        } catch (error) {
            this.handleError(error, 'clearParentQuestionSelection');
        }
    }
    
    // Choice management - 간소화
    initializeChoiceOptions() {
        try {
            const defaultChoices = [
                { id: this.generateId(), value: '', placeholder: 'Option 1' },
                { id: this.generateId(), value: '', placeholder: 'Option 2' }
            ];
            this.updateFormData({ choiceOptions: defaultChoices });
        } catch (error) {
            this.handleError(error, 'initializeChoiceOptions');
        }
    }
    
    generateId() {
        try {
            return `choice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        } catch (error) {
            this.handleError(error, 'generateId');
            return `choice_${Date.now()}_fallback`;
        }
    }
    
    handleChoiceChange(event) {
        try {
            if (!event?.target) {
                throw new Error('Invalid event object');
            }
            
            const indexStr = event.target.dataset?.index;
            if (indexStr === undefined || indexStr === null) {
                throw new Error('Index not found in dataset');
            }
            
            const index = parseInt(indexStr, 10);
            if (isNaN(index)) {
                throw new Error('Invalid index value');
            }
            
            const newChoices = [...(this.formData.choiceOptions || [])];
            
            if (newChoices[index]) {
                newChoices[index] = {
                    ...newChoices[index],
                    value: event.target.value || ''
                };
                this.updateFormData({ choiceOptions: newChoices });
            } else {
                throw new Error(`Choice at index ${index} not found`);
            }
        } catch (error) {
            this.handleError(error, 'handleChoiceChange');
        }
    }
    
    addChoice(event) {
        event.preventDefault();
        event.stopPropagation();

        try {
            const currentChoices = this.formData.choiceOptions || [];
            const newChoice = {
                id: this.generateId(),
                value: '',
                placeholder: `Option ${currentChoices.length + 1}`
            };
            
            this.updateFormData({ 
                choiceOptions: [...currentChoices, newChoice] 
            });
        } catch (error) {
            this.handleError(error, 'addChoice');
        }
    }
    
    removeChoice(event) {
        try {
            event.preventDefault();
            event.stopPropagation();

            if (!event?.target && !event?.currentTarget) {
                throw new Error('Invalid event object');
            }
            
            const choiceId = event.target?.dataset?.id || event.currentTarget?.dataset?.id;
            if (!choiceId) {
                throw new Error('Choice ID not found');
            }
            
            const currentChoices = this.formData.choiceOptions || [];
            
            if (currentChoices.length > 1) {
                const filtered = currentChoices.filter(choice => choice.id !== choiceId);
                const reindexed = filtered.map((choice, idx) => ({
                    ...choice,
                    placeholder: `Option ${idx + 1}`
                }));
                this.updateFormData({ choiceOptions: reindexed });
            } else {
                this.showToast('Warning', 'At least one choice is required.', 'warning');
            }
        } catch (error) {
            this.handleError(error, 'removeChoice');
        }
    }
    
    // 안전한 비동기 데이터 로딩
    async loadParentQuestionItems(questionId) {
        if (!questionId) {
            this.log('loadParentQuestionItems', 'No questionId provided');
            return;
        }
        
        try {
            if (this.isLoadingChoices) {
                this.log('loadParentQuestionItems', 'Already loading choices, skipping');
                return;
            }
            
            this.isLoadingChoices = true;
            
            const items = await getAssessmentQuestionItems({ questionId });
            
            if (!Array.isArray(items)) {
                this.log('Warning: getAssessmentQuestionItems returned non-array', items);
                this._parentQuestionItems = [];
            } else {
                this._parentQuestionItems = items;
            }
            
            this.log('Parent question items loaded', this._parentQuestionItems.length);
            
        } catch (error) {
            this.handleError(error, 'loadParentQuestionItems');
            this._parentQuestionItems = [];
            this.showToast('Warning', 'Could not load parent question options.', 'warning');
        } finally {
            try {
                this.isLoadingChoices = false;
            } catch (error) {
                this.handleError(error, 'loadParentQuestionItems - finally block');
            }
        }
    }
    
    // 향상된 유효성 검사
    validateForm() {
        try {
            const errors = [];
            
            // 필수 필드 검증
            if (!this.formData.questionType?.trim()) {
                errors.push('Question Type is required.');
            }
            
            if (!this.formData.questionText?.trim()) {
                errors.push('Question Text is required.');
            }
            
            // 선택지 검증
            if (this.showChoiceOptions) {
                try {
                    const validChoices = (this.formData.choiceOptions || []).filter(
                        choice => choice?.value?.trim()
                    );
                    if (validChoices.length < 2) {
                        errors.push('At least 2 choices are required for choice-based questions.');
                    }
                } catch (choiceError) {
                    this.handleError(choiceError, 'validateForm - choice validation');
                    errors.push('Error validating choices.');
                }
            }
            
            // 관련 질문 검증
            if (this.formData.isRelatedQuestionEnabled) {
                if (!this.formData.selectedParentQuestionId) {
                    errors.push('Parent Question is required when Related Question is enabled.');
                }
                if (!this.formData.selectedConditionValue?.trim()) {
                    errors.push('Condition Value is required when Related Question is enabled.');
                }
            }
            
            return errors;
        } catch (error) {
            this.handleError(error, 'validateForm');
            return ['Form validation error occurred.'];
        }
    }
    
    // Save operations - 트랜잭션 안전성 개선
    async handleSave() {
        try {
            if (this.isLoading) {
                return;
            }
            const result = await this.saveQuestion(false);
            if (result?.success) {
                this.close(result);
            }
        } catch (error) {
            this.handleError(error, 'handleSave');
        }
    }
    
    async handleSaveAndNew() {
        try {
            if (this.isLoading) {
                return;
            }
            const result = await this.saveQuestion(true);
            if (result?.success && result.saveAndNew) {
                await this.resetForm();
                await this.initializeData();
            }
        } catch (error) {
            this.handleError(error, 'handleSaveAndNew');
        }
    }
    
    async saveQuestion(saveAndNew = false) {
        try {
            const validationErrors = this.validateForm();
            
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(' '), 'error');
                return { success: false };
            }
            
            this.isLoading = true;
            
            const questionData = this.buildQuestionData();
            if (!questionData) {
                throw new Error('Failed to build question data');
            }
            
            const response = await createAssessmentQuestion({ 
                questionData: JSON.stringify(questionData) 
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
                return await this.handleSaveSuccess(result, saveAndNew);
            } else {
                this.showToast('Error', result.message || 'Unknown server error', 'error');
                return { success: false };
            }
            
        } catch (error) {
            this.handleError(error, 'saveQuestion');
            return { success: false };
        } finally {
            try {
                this.isLoading = false;
            } catch (error) {
                this.handleError(error, 'saveQuestion - finally block');
            }
        }
    }
    
    buildQuestionData() {
        try {
            const data = {
                questionType: this.formData.questionType || '',
                questionText: this.formData.questionText || '',
                choices: [],
                hasRelatedQuestion: Boolean(this.formData.isRelatedQuestionEnabled),
                relatedQuestionId: null,
                relatedCriteria: null,
                fileIncluded: Boolean(this.formData.isImageEnabled)
            };
            
            // 선택지 처리
            if (this.showChoiceOptions && Array.isArray(this.formData.choiceOptions)) {
                try {
                    data.choices = this.formData.choiceOptions
                        .filter(choice => choice?.value?.trim())
                        .map(choice => choice.value);
                } catch (choiceError) {
                    this.handleError(choiceError, 'buildQuestionData - choices');
                    data.choices = [];
                }
            }
            
            // 관련 질문 처리
            if (data.hasRelatedQuestion) {
                data.relatedQuestionId = this.formData.selectedParentQuestionId || null;
                data.relatedCriteria = this.formData.selectedConditionValue || null;
            }
            
            return data;
        } catch (error) {
            this.handleError(error, 'buildQuestionData');
            return null;
        }
    }
    
    async handleSaveSuccess(result, saveAndNew) {
        try {
            const message = saveAndNew ? 
                `${result.message || 'Question saved successfully'} You can create another question.` : 
                (result.message || 'Question saved successfully');
                
            this.showToast('Success', message, 'success');
            
            if (saveAndNew) {
                return { 
                    success: true, 
                    saveAndNew: true,
                    questionId: result.questionId || null 
                };
            } else {
                return { 
                    success: true,
                    action: 'save',
                    questionId: result.questionId || null 
                };
            }
        } catch (error) {
            this.handleError(error, 'handleSaveSuccess');
            return { success: false };
        }
    }
    
    async resetForm() {
        try {
            this.formData = this.getInitialFormData();
            this._parentQuestionItems = [];
            this.log('Form reset successfully');
        } catch (error) {
            this.handleError(error, 'resetForm');
        }
    }
    
    handleCancel() {
        try {
            this.log('Cancel clicked');
            this.close({ action: 'cancel', success: false });
        } catch (error) {
            this.handleError(error, 'handleCancel');
            // 강제로 닫기 시도
            try {
                this.close({ action: 'force_close', success: false });
            } catch (forceError) {
                this.handleError(forceError, 'handleCancel - force close');
            }
        }
    }
    
    // Utility methods
    log(message, data) {
        try {
            if (DEBUG) {
                console.log(`[DkeduAssessmentQuestionModal] ${message}`, data || '');
            }
        } catch (error) {
            // Silent fail for logging
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
            
            // 개발 환경에서는 더 자세한 정보 제공
            if (DEBUG) {
                message = `${context}: ${message}`;
            }
            
            this.showToast('Error', message, 'error');
            
        } catch (handlerError) {
            // 에러 핸들러에서 에러가 발생한 경우
            console.error('Error in error handler:', handlerError);
            console.error('Original error:', error);
            
            try {
                this.showToast('Critical Error', 'A critical error occurred. Please refresh the page.', 'error');
            } catch (toastError) {
                // 토스트조차 실패한 경우
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
            
            // Fallback: console로 메시지 출력
            console.log(`${variant.toUpperCase()}: ${title} - ${message}`);
        }
    }
}