/**
 * @description Assessment Question Record Component - DKEDU (DK Lab Standards Applied)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Components
 * @created date 2025-09-25
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.4.0
 */

import { LightningElement, track, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import ASSESSMENT_QUESTION_OBJECT from '@salesforce/schema/AssessmentQuestion__c';
import TYPE_FIELD from '@salesforce/schema/AssessmentQuestion__c.Type__c';
import createAssessmentQuestion from '@salesforce/apex/DKEDU_AssessmentQuestionController.createAssessmentQuestion';
import getAssessmentQuestions from '@salesforce/apex/DKEDU_AssessmentQuestionController.getAssessmentQuestions';
import getAssessmentQuestionItems from '@salesforce/apex/DKEDU_AssessmentQuestionController.getAssessmentQuestionItems';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Custom Labels
import DKEDU_AQ_LBL_TYPE from '@salesforce/label/c.DKEDU_AQ_LBL_TYPE';
import DKEDU_AQ_LBL_QUESTION from '@salesforce/label/c.DKEDU_AQ_LBL_QUESTION';
import DKEDU_AQ_LBL_QUESTIONOPTION from '@salesforce/label/c.DKEDU_AQ_LBL_QUESTIONOPTION';
import DKEDU_AQ_LBL_RELATIONQUESTION from '@salesforce/label/c.DKEDU_AQ_LBL_RELATIONQUESTION';
import DKEDU_AQ_LBL_RELATIONPARENT from '@salesforce/label/c.DKEDU_AQ_LBL_RELATIONPARENT';
import DKEDU_AQ_LBL_RELATIONCONDITION from '@salesforce/label/c.DKEDU_AQ_LBL_RELATIONCONDITION';
import DKEDU_AQ_LBL_IMAGE from '@salesforce/label/c.DKEDU_AQ_LBL_IMAGE';
import DKEDU_AQ_BTN_OPTIONADD from '@salesforce/label/c.DKEDU_AQ_BTN_OPTIONADD';
import DKEDU_AQ_MSG_CONDITIONDESCRIPTION from '@salesforce/label/c.DKEDU_AQ_MSG_CONDITIONDESCRIPTION';
import DKEDU_AQ_MSG_OPTIONDESCRIPTION from '@salesforce/label/c.DKEDU_AQ_MSG_OPTIONDESCRIPTION';
import DKEDU_AQ_MSG_PARENTQUESTIONDESCRIPTION from '@salesforce/label/c.DKEDU_AQ_MSG_PARENTQUESTIONDESCRIPTION';
import DKEDU_AQ_MSG_QUESTIONDESCRIPTION from '@salesforce/label/c.DKEDU_AQ_MSG_QUESTIONDESCRIPTION';
import DKEDU_AQ_MSG_TYPEDESCRIPTION from '@salesforce/label/c.DKEDU_AQ_MSG_TYPEDESCRIPTION';

const DEBUG = false;

export default class DkeduAssessmentQuestionRecord extends NavigationMixin(LightningElement) {
    
    static DEBUG = false;
    _hasInitialized = false;
    
    @api recordId;
    @api objectApiName;
    
    // Wire methods to fetch picklist values
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_QUESTION_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: TYPE_FIELD })
    typePicklistValues;
    
    // 모든 상태를 하나의 formState로 관리
    @track _formState = {
        selectedQuestionType: '',
        questionText: '',
        choiceOptions: [],
        isRelatedQuestionEnabled: false,
        isImageEnabled: false,
        parentQuestionSearchTerm: '',
        selectedParentQuestion: null,
        selectedConditionValue: '',
        isParentQuestionDropdownOpen: false,
        parentQuestionItems: [],
        isLoading: false,
        isLoadingChoices: false
    };
    
    @track parentQuestions = [];
    @track filteredParentQuestions = [];
    @track renderKey = 0;
    
    // Getter를 통한 상태 접근
    get selectedQuestionType() { return this._formState.selectedQuestionType; }
    get questionText() { return this._formState.questionText; }
    get choiceOptions() { return this._formState.choiceOptions; }
    get isRelatedQuestionEnabled() { return this._formState.isRelatedQuestionEnabled; }
    get isImageEnabled() { return this._formState.isImageEnabled; }
    get parentQuestionSearchTerm() { return this._formState.parentQuestionSearchTerm; }
    get selectedParentQuestion() { return this._formState.selectedParentQuestion; }
    get selectedConditionValue() { return this._formState.selectedConditionValue; }
    get isParentQuestionDropdownOpen() { return this._formState.isParentQuestionDropdownOpen; }
    get parentQuestionItems() { return this._formState.parentQuestionItems; }
    get isLoading() { return this._formState.isLoading; }
    get isLoadingChoices() { return this._formState.isLoadingChoices; }
    
    // Custom Labels
    get label() {
        return {
            DKEDU_AQ_LBL_TYPE,
            DKEDU_AQ_LBL_QUESTION,
            DKEDU_AQ_LBL_QUESTIONOPTION,
            DKEDU_AQ_LBL_RELATIONQUESTION,
            DKEDU_AQ_LBL_RELATIONPARENT,
            DKEDU_AQ_LBL_RELATIONCONDITION,
            DKEDU_AQ_LBL_IMAGE,
            DKEDU_AQ_BTN_OPTIONADD,
            DKEDU_AQ_MSG_CONDITIONDESCRIPTION,
            DKEDU_AQ_MSG_OPTIONDESCRIPTION,
            DKEDU_AQ_MSG_PARENTQUESTIONDESCRIPTION,
            DKEDU_AQ_MSG_QUESTIONDESCRIPTION,
            DKEDU_AQ_MSG_TYPEDESCRIPTION
        };
    }

    /**
     * @description Format custom label with dynamic values
     * @param {String} labelText - Label text with placeholders
     * @param {...String} values - Values to replace placeholders
     * @returns {String} Formatted label text
     */
    formatLabel(labelText, ...values) {
        try {
            let result = labelText;
            values.forEach((value, index) => {
                // Support both {0}, {1}, etc. and (0), (1), etc. patterns
                result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), value);
                result = result.replace(new RegExp(`\\(${index}\\)`, 'g'), value);
            });
            return result;
        } catch (error) {
            this.log('formatLabel error', error);
            return labelText || '';
        }
    }

    /**
     * @description Generate dynamic option placeholder
     * @param {Number} optionNumber - Option number
     * @returns {String} Generated placeholder text
     */
    generateOptionPlaceholder(optionNumber) {
        return this.formatLabel(DKEDU_AQ_MSG_OPTIONDESCRIPTION, optionNumber);
    }

    /**
     * @description Generate condition placeholder (remove {0} placeholder for dropdown)
     * @returns {String} Condition placeholder text
     */
    get conditionPlaceholder() {
        // Remove the {0} placeholder from the condition description for dropdown use
        return DKEDU_AQ_MSG_CONDITIONDESCRIPTION.replace(/\{0\}/g, '').replace(/\(0\)/g, '').trim();
    }
    
    /**
     * @description Initialize form to default state
     * @public
     */
    @api
    initializeForm() {
        this.log('initializeForm', 'Initializing form');
        this.fullReset();
    }
    
    /**
     * @description Open modal
     * @public
     */
    @api
    openModal() {
        this.log('openModal', 'Opening modal');
        this.fullReset();
    }
    
    /**
     * @description Debug logging utility
     * @param {String} message - Log message
     * @param {*} variable - Variable to log
     */
    log(message, variable) {
        if (DEBUG) {
            console.log(`DkeduAssessmentQuestionRecord ${message}`, variable === undefined ? '' : 
                (typeof variable === 'object' ? JSON.stringify(variable) : variable));
        }
    }

    /**
     * @description Error handling utility
     * @param {Error} error - Error object
     * @param {String} from - Source of error
     */
    errorHandler(error, from = 'DkeduAssessmentQuestionRecord') {
        try {
            if (error.body !== undefined) {
                this.showToast('Error', `${from} -> ${error.body.message}`, 'error');
            } else if (error.message !== undefined) {
                this.showToast('Error', `${from} -> ${error.message}`, 'error');
            } else if (typeof error === 'string') {
                this.showToast('Error', `${from} -> ${error}`, 'error');
            } else {
                console.error('Unknown error -> ', error);
                this.showToast('Error', 'Unknown error in javascript controller/helper.', 'error');
            }
        } catch (handlerError) {
            console.error('[errorHandler] Failed to handle error:', handlerError);
        }
    }

    /**
     * @description Show toast message
     * @param {String} title - Toast title
     * @param {String} message - Toast message
     * @param {String} variant - Toast variant (success, error, warning, info)
     */
    showToast(title, message, variant) {
        try {
            const event = new ShowToastEvent({
                title: title,
                message: message,
                variant: variant
            });
            this.dispatchEvent(event);
        } catch (error) {
            console.error('[showToast] Failed to show toast:', error);
        }
    }

    get questionTypeOptions() {
        try {
            // Use actual picklist values from Salesforce metadata
            if (!this.typePicklistValues || !this.typePicklistValues.data) {
                return [];
            }

            const picklistValues = this.typePicklistValues.data.values;
            return picklistValues.map(option => ({
                value: option.value,
                label: option.label,
                selected: option.value === this.selectedQuestionType
            }));
        } catch (error) {
            this.log('questionTypeOptions error', error);
            return [];
        }
    }

    get showChoiceOptions() {
        try {
            // Show choice options for question types that require multiple options
            const choiceBasedTypes = ['Choosable', 'Multi Choosable', '객관식 (단일 선택)', '객관식 (다중 선택)'];
            return choiceBasedTypes.includes(this.selectedQuestionType);
        } catch (error) {
            this.log('showChoiceOptions error', error);
            return false;
        }
    }

    get isOnlyOneChoice() {
        return this.choiceOptions.length <= 1;
    }

    get parentQuestionChoices() {
        try {
            if (!this.selectedParentQuestion || !this.isParentQuestionChoiceBased || 
                !this.parentQuestionItems || this.parentQuestionItems.length === 0) {
                this.log('parentQuestionChoices early return', {
                    selectedParentQuestion: !!this.selectedParentQuestion,
                    isParentQuestionChoiceBased: this.isParentQuestionChoiceBased,
                    parentQuestionItems: this.parentQuestionItems,
                    parentQuestionItemsLength: this.parentQuestionItems ? this.parentQuestionItems.length : 'null/undefined'
                });
                return [];
            }

            const choices = this.parentQuestionItems.map(item => ({
                value: item.Content__c,
                label: item.Content__c,
                selected: item.Content__c === this.selectedConditionValue
            }));
            
            this.log('parentQuestionChoices returning choices', {
                parentQuestionItems: this.parentQuestionItems,
                choices: choices,
                selectedConditionValue: this.selectedConditionValue
            });
            
            return choices;
        } catch (error) {
            this.log('parentQuestionChoices error', error);
            return [];
        }
    }

    get isParentQuestionChoiceBased() {
        try {
            if (!this.selectedParentQuestion) {
                return false;
            }
            
            const choiceBasedTypes = ['Choosable', 'MultiChoosable', '객관식 (단일 선택)', '객관식 (다중 선택)'];
            return choiceBasedTypes.includes(this.selectedParentQuestion.Type__c);
        } catch (error) {
            this.log('isParentQuestionChoiceBased error', error);
            return false;
        }
    }

    async connectedCallback() {
        this.log('connectedCallback', 'Starting');
        
        try {
            this.fullReset();
            
            this.parentQuestions = await getAssessmentQuestions();
            this.filteredParentQuestions = [...this.parentQuestions];
            this.log('Parent questions loaded', this.parentQuestions.length);
        } catch (error) {
            this.log('connectedCallback error', error);
            this.parentQuestions = [];
            this.filteredParentQuestions = [];
            this.errorHandler(error, 'connectedCallback');
        }
        
        this.log('connectedCallback', 'Completed');
    }

    renderedCallback() {
        if (!this._hasInitialized) {
            this.log('renderedCallback', 'First render initialization');
            this._hasInitialized = true;
            
            // DOM이 완전히 렌더된 후 필드 초기화
            setTimeout(() => {
                this.clearDOMFields();
            }, 0);
        }
    }

    disconnectedCallback() {
        this.log('disconnectedCallback', 'Component disconnected');
        this._hasInitialized = false;
    }

    initializeChoiceOptions() {
        try {
            if (this.showChoiceOptions && this.choiceOptions.length === 0) {
                this._formState = {
                    ...this._formState,
                    choiceOptions: [
                        { id: this.generateId(), value: '', placeholder: this.generateOptionPlaceholder(1) },
                        { id: this.generateId(), value: '', placeholder: this.generateOptionPlaceholder(2) }
                    ]
                };
            }
        } catch (error) {
            this.log('initializeChoiceOptions error', error);
        }
    }

    generateId() {
        return `choice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    handleQuestionTypeChange(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            this.log('handleQuestionTypeChange', event.target.value);
            this._formState = {
                ...this._formState,
                selectedQuestionType: event.target.value
            };
            
            if (this.showChoiceOptions && this.choiceOptions.length === 0) {
                this.initializeChoiceOptions();
            } else if (!this.showChoiceOptions) {
                this._formState = {
                    ...this._formState,
                    choiceOptions: []
                };
            }
        } catch (error) {
            this.errorHandler(error, 'handleQuestionTypeChange');
        }
    }

    handleQuestionTextChange(event) {
        try {
            this.log('handleQuestionTextChange', event.target.value);
            this._formState = {
                ...this._formState,
                questionText: event.target.value
            };
        } catch (error) {
            this.errorHandler(error, 'handleQuestionTextChange');
        }
    }

    handleChoiceChange(event) {
        try {
            const index = parseInt(event.target.dataset.index, 10);
            const newChoiceOptions = [...this.choiceOptions];
            newChoiceOptions[index] = {
                ...newChoiceOptions[index],
                value: event.target.value
            };
            this._formState = {
                ...this._formState,
                choiceOptions: newChoiceOptions
            };
            this.log('handleChoiceChange', { index, value: event.target.value });
        } catch (error) {
            this.errorHandler(error, 'handleChoiceChange');
        }
    }

    addChoice() {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            this.log('addChoice', '');
            const newChoice = {
                id: this.generateId(),
                value: '',
                placeholder: this.generateOptionPlaceholder(this.choiceOptions.length + 1)
            };
            this._formState = {
                ...this._formState,
                choiceOptions: [...this.choiceOptions, newChoice]
            };
        } catch (error) {
            this.errorHandler(error, 'addChoice');
        }
    }

    removeChoice(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            let choiceId = event.target.dataset.id;
            if (!choiceId && event.currentTarget) {
                choiceId = event.currentTarget.dataset.id;
            }
            
            this.log('removeChoice', { choiceId, currentCount: this.choiceOptions.length });
            
            if (this.choiceOptions.length > 1 && choiceId) {
                const filtered = this.choiceOptions.filter(choice => choice.id !== choiceId);
                const reindexed = filtered.map((choice, idx) => ({
                    ...choice,
                    placeholder: this.generateOptionPlaceholder(idx + 1)
                }));
                this._formState = {
                    ...this._formState,
                    choiceOptions: reindexed
                };
                this.log('removeChoice completed', { newCount: reindexed.length });
            }
        } catch (error) {
            this.errorHandler(error, 'removeChoice');
        }
    }

    handleRelatedQuestionToggle(event) {
        try {
            this.log('handleRelatedQuestionToggle', event.target.checked);
            this._formState = {
                ...this._formState,
                isRelatedQuestionEnabled: event.target.checked
            };
            
            if (!event.target.checked) {
                this._formState = {
                    ...this._formState,
                    selectedParentQuestion: null,
                    parentQuestionSearchTerm: '',
                    selectedConditionValue: '',
                    parentQuestionItems: []
                };
                this.filteredParentQuestions = [...this.parentQuestions];
            }
        } catch (error) {
            this.errorHandler(error, 'handleRelatedQuestionToggle');
        }
    }

    handleParentQuestionSearch(event) {
        try {
            this._formState = {
                ...this._formState,
                parentQuestionSearchTerm: event.target.value,
                isParentQuestionDropdownOpen: true
            };
            this.log('handleParentQuestionSearch', event.target.value);
            this.filterParentQuestions();
        } catch (error) {
            this.errorHandler(error, 'handleParentQuestionSearch');
        }
    }

    filterParentQuestions() {
        try {
            if (!this.parentQuestionSearchTerm) {
                this.filteredParentQuestions = [...this.parentQuestions];
            } else {
                const searchTerm = this.parentQuestionSearchTerm.toLowerCase();
                this.filteredParentQuestions = this.parentQuestions.filter(question =>
                    (question.Question__c && question.Question__c.toLowerCase().includes(searchTerm)) ||
                    (question.Type__c && question.Type__c.toLowerCase().includes(searchTerm))
                );
            }
            this.log('filterParentQuestions', this.filteredParentQuestions.length);
        } catch (error) {
            this.errorHandler(error, 'filterParentQuestions');
        }
    }

    handleParentQuestionFocus() {
        try {
            this._formState = {
                ...this._formState,
                isParentQuestionDropdownOpen: true
            };
        } catch (error) {
            this.errorHandler(error, 'handleParentQuestionFocus');
        }
    }

    handleParentQuestionBlur() {
        try {
            // relatedTarget 확인 - 클릭한 곳이 드롭다운 내부인지 확인
            setTimeout(() => {
                // 마우스가 드롭다운 위에 있는지 확인
                const dropdown = this.template.querySelector('.slds-dropdown');
                if (dropdown && dropdown.matches(':hover')) {
                    return; // 드롭다운 위에 마우스가 있으면 닫지 않음
                }
                
                this._formState = {
                    ...this._formState,
                    isParentQuestionDropdownOpen: false
                };
            }, 150);
        } catch (error) {
            this.errorHandler(error, 'handleParentQuestionBlur');
        }
    }

    handleDropdownMouseEnter() {
        // 드롭다운에 마우스가 들어왔음을 표시하여 blur 시 닫지 않도록 예정
        this._isMouseOverDropdown = true;
    }

    handleDropdownMouseLeave() {
        // 드롭다운에서 마우스가 나갔음을 표시하여 blur 허용
        this._isMouseOverDropdown = false;
    }

    async selectParentQuestion(event) {
        try {
            const questionId = event.currentTarget.dataset.questionId;
            const selectedQuestion = this.parentQuestions.find(q => q.Id === questionId);
            
            this.log('selectParentQuestion', { questionId, selectedQuestion });
            
            if (selectedQuestion) {
                this._formState = {
                    ...this._formState,
                    selectedParentQuestion: selectedQuestion,
                    parentQuestionSearchTerm: selectedQuestion.Question__c,
                    selectedConditionValue: '',
                    isParentQuestionDropdownOpen: false
                };
                
                if (this.isParentQuestionChoiceBased) {
                    await this.loadParentQuestionItems(questionId);
                } else {
                    this._formState = {
                        ...this._formState,
                        parentQuestionItems: []
                    };
                }
            }
        } catch (error) {
            this.errorHandler(error, 'selectParentQuestion');
        }
    }

    handleConditionValueChange(event) {
        try {
            this._formState = {
                ...this._formState,
                selectedConditionValue: event.target.value
            };
            this.log('handleConditionValueChange', event.target.value);
        } catch (error) {
            this.errorHandler(error, 'handleConditionValueChange');
        }
    }

    handleImageToggle(event) {
        try {
            this.log('handleImageToggle', event.target.checked);
            this._formState = {
                ...this._formState,
                isImageEnabled: event.target.checked
            };
        } catch (error) {
            this.errorHandler(error, 'handleImageToggle');
        }
    }

    async loadParentQuestionItems(questionId) {
        this.log('loadParentQuestionItems starting', questionId);
        
        try {
            if (!questionId) {
                this._formState = {
                    ...this._formState,
                    parentQuestionItems: []
                };
                return;
            }

            this._formState = {
                ...this._formState,
                isLoadingChoices: true
            };
            
            const items = await getAssessmentQuestionItems({ questionId: questionId });
            this.log('loadParentQuestionItems raw items from Apex', items);
            
            this._formState = {
                ...this._formState,
                parentQuestionItems: items,
                isLoadingChoices: false
            };
            this.log('loadParentQuestionItems completed', { 
                items: items, 
                itemsLength: items ? items.length : 'null/undefined',
                formStateUpdated: this.parentQuestionItems
            });
        } catch (error) {
            this.log('loadParentQuestionItems error', error);
            this._formState = {
                ...this._formState,
                parentQuestionItems: [],
                isLoadingChoices: false
            };
            this.errorHandler(error, 'loadParentQuestionItems');
        }
    }

    validateForm() {
        try {
            const errors = [];

            if (!this.selectedQuestionType) {
                errors.push('질문 유형을 선택해 주세요.');
            }

            if (!this.questionText.trim()) {
                errors.push('질문을 입력해 주세요.');
            }

            if (this.showChoiceOptions) {
                const filledChoices = this.choiceOptions.filter(choice => choice.value.trim());
                if (filledChoices.length < 2) {
                    errors.push('최소 2개 이상의 선택지를 입력해 주세요.');
                }
            }

            if (this.isRelatedQuestionEnabled) {
                if (!this.selectedParentQuestion) {
                    errors.push('부모 질문을 선택해 주세요.');
                }
                if (!this.selectedConditionValue) {
                    errors.push('조건을 입력해 주세요.');
                }
            }

            return errors;
        } catch (error) {
            this.errorHandler(error, 'validateForm');
            return ['Validation error occurred'];
        }
    }

    async handleSave() {
        this.log('handleSave', 'Starting');
        
        try {
            const validationErrors = this.validateForm();
            this.log('Validation results', validationErrors);
            
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(', '), 'error');
                return;
            }

            this._formState = {
                ...this._formState,
                isLoading: true
            };

            const questionData = {
                questionType: this.selectedQuestionType,
                questionText: this.questionText,
                choices: this.showChoiceOptions ? 
                    this.choiceOptions
                        .filter(choice => choice.value && choice.value.trim())
                        .map(choice => choice.value) : [],
                hasRelatedQuestion: this.isRelatedQuestionEnabled,
                relatedQuestionId: this.isRelatedQuestionEnabled && this.selectedParentQuestion ? 
                    this.selectedParentQuestion.Id : null,
                relatedCriteria: this.isRelatedQuestionEnabled ? this.selectedConditionValue : null,
                fileIncluded: this.isImageEnabled
            };

            this.log('Question data prepared', questionData);

            const response = await createAssessmentQuestion({ questionData: JSON.stringify(questionData) });
            const result = JSON.parse(response);
            this.log('Save result', result);

            if (result.success) {
                this.showToast('Success', result.message, 'success');
                this.fullReset();
                this.closeModal();
            } else {
                this.showToast('Error', result.message, 'error');
            }

        } catch (error) {
            this.errorHandler(error, 'handleSave');
        } finally {
            this._formState = {
                ...this._formState,
                isLoading: false
            };
        }
    }

    handleCancel() {
        try {
            this.log('handleCancel', '');
            this.fullReset();
            this.closeModal();
        } catch (error) {
            this.errorHandler(error, 'handleCancel');
        }
    }

    closeModal() {
        try {
            this.log('closeModal', '');
            
            const closeEvent = new CustomEvent('close', {
                detail: { reason: 'Modal closed' }
            });
            this.dispatchEvent(closeEvent);
            
            if (this.recordId) {
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: this.recordId,
                        actionName: 'view'
                    }
                });
            } else {
                this[NavigationMixin.Navigate]({
                    type: 'standard__objectPage',
                    attributes: {
                        objectApiName: 'AssessmentQuestion__c',
                        actionName: 'home'
                    }
                });
            }
        } catch (error) {
            this.errorHandler(error, 'closeModal');
        }
    }

    fullReset() {
        try {
            this.log('fullReset', 'Starting complete reset');
            
            // 상태의 formState 객체 초기화 (깊은 복사)
            this._formState = {
                selectedQuestionType: '',
                questionText: '',
                choiceOptions: [],
                isRelatedQuestionEnabled: false,
                isImageEnabled: false,
                parentQuestionSearchTerm: '',
                selectedParentQuestion: null,
                selectedConditionValue: '',
                isParentQuestionDropdownOpen: false,
                parentQuestionItems: [],
                isLoading: false,
                isLoadingChoices: false
            };
            
            if (this.parentQuestions && this.parentQuestions.length > 0) {
                this.filteredParentQuestions = [...this.parentQuestions];
            }
            
            // renderKey 증가로 전체 재렌더링
            this.renderKey = this.renderKey + 1;
            
            // DOM 필드 초기화
            setTimeout(() => {
                this.clearDOMFields();
            }, 0);
            
            this.log('fullReset completed', { renderKey: this.renderKey });
        } catch (error) {
            this.errorHandler(error, 'fullReset');
        }
    }

    async handleSaveAndNew() {
        this.log('handleSaveAndNew', 'Starting');
        
        try {
            const validationErrors = this.validateForm();
            this.log('Validation results', validationErrors);
            
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(', '), 'error');
                return;
            }

            this._formState = {
                ...this._formState,
                isLoading: true
            };

            const questionData = {
                questionType: this.selectedQuestionType,
                questionText: this.questionText,
                choices: this.showChoiceOptions ? 
                    this.choiceOptions
                        .filter(choice => choice.value && choice.value.trim())
                        .map(choice => choice.value) : [],
                hasRelatedQuestion: this.isRelatedQuestionEnabled,
                relatedQuestionId: this.isRelatedQuestionEnabled && this.selectedParentQuestion ? 
                    this.selectedParentQuestion.Id : null,
                relatedCriteria: this.isRelatedQuestionEnabled ? this.selectedConditionValue : null,
                fileIncluded: this.isImageEnabled
            };

            this.log('Question data prepared', questionData);

            const response = await createAssessmentQuestion({ questionData: JSON.stringify(questionData) });
            const result = JSON.parse(response);
            this.log('Save result', result);

            if (result.success) {
                this.showToast('Success', `${result.message} - 새 질문을 작성할 수 있습니다.`, 'success');
                
                // 부모 질문 목록 새로고침 (방금 저장한 질문이 부모 질문으로 사용될 수 있도록)
                this.parentQuestions = await getAssessmentQuestions();
                this.filteredParentQuestions = [...this.parentQuestions];
                
                // 폼 초기화 (모달은 닫지 않음)
                this.fullReset();
            } else {
                this.showToast('Error', result.message, 'error');
            }

        } catch (error) {
            this.errorHandler(error, 'handleSaveAndNew');
        } finally {
            this._formState = {
                ...this._formState,
                isLoading: false
            };
        }
    }

    clearDOMFields() {
        this.log('clearDOMFields', 'Starting');
        
        try {
            const inputs = this.template.querySelectorAll('input[type="text"], input[type="checkbox"], textarea, select');
            inputs.forEach(input => {
                if (input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            });
            this.log('clearDOMFields completed', inputs.length);
        } catch (error) {
            this.log('clearDOMFields error', error);
        }
    }
}