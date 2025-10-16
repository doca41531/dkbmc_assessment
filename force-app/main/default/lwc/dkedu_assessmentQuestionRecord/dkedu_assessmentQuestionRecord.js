/**
 * @description       : Assessment Question Record Component - DKEDU (Fixed Version)
 * @author            : mingyu.park@dkbmc.com
 * @group             : DKEDU Components
 * @created date      : 2025-09-25
 * @last modified on  : 2025-10-16
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 1.3.4
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

export default class Dkedu_assessmentQuestionRecord extends NavigationMixin(LightningElement) {
    
    static DEBUG = false;
    _hasInitialized = false;
    
    @api recordId;
    @api objectApiName;
    
    // Wire methods to fetch picklist values
    @wire(getObjectInfo, { objectApiName: ASSESSMENT_QUESTION_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: TYPE_FIELD })
    typePicklistValues;
    
    // ëª¨ë“  ìƒíƒœë¥¼ í•˜ë‚˜ì˜ ê°ì²´ë¡œ ê´€ë¦¬
    @track formState = {
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
    
    // Getterë¥¼ í†µí•œ ìƒíƒœ ì ‘ê·¼
    get selectedQuestionType() { return this.formState.selectedQuestionType; }
    get questionText() { return this.formState.questionText; }
    get choiceOptions() { return this.formState.choiceOptions; }
    get isRelatedQuestionEnabled() { return this.formState.isRelatedQuestionEnabled; }
    get isImageEnabled() { return this.formState.isImageEnabled; }
    get parentQuestionSearchTerm() { return this.formState.parentQuestionSearchTerm; }
    get selectedParentQuestion() { return this.formState.selectedParentQuestion; }
    get selectedConditionValue() { return this.formState.selectedConditionValue; }
    get isParentQuestionDropdownOpen() { return this.formState.isParentQuestionDropdownOpen; }
    get parentQuestionItems() { return this.formState.parentQuestionItems; }
    get isLoading() { return this.formState.isLoading; }
    get isLoadingChoices() { return this.formState.isLoadingChoices; }
    
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

    // Helper method to format custom label with dynamic values
    formatLabel(labelText, ...values) {
        let result = labelText;
        values.forEach((value, index) => {
            // Support both {0}, {1}, etc. and (0), (1), etc. patterns
            result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), value);
            result = result.replace(new RegExp(`\\(${index}\\)`, 'g'), value);
        });
        return result;
    }

    // Generate dynamic option placeholder
    generateOptionPlaceholder(optionNumber) {
        return this.formatLabel(DKEDU_AQ_MSG_OPTIONDESCRIPTION, optionNumber);
    }

    // Generate condition placeholder (remove {0} placeholder for dropdown)
    get conditionPlaceholder() {
        // Remove the {0} placeholder from the condition description for dropdown use
        return DKEDU_AQ_MSG_CONDITIONDESCRIPTION.replace(/\{0\}/g, '').replace(/\(0\)/g, '').trim();
    }
    
    @api
    initializeForm() {
        this.log('initializeForm - ì™¸ë¶€ì—ì„œ í˜¸ì¶œë¨', '');
        this.fullReset();
    }
    
    @api
    openModal() {
        this.log('openModal - ëª¨ë‹¬ ì—´ê¸°', '');
        this.fullReset();
    }
    
    log(msg, variable) {
        if (Dkedu_assessmentQuestionRecord.DEBUG) {
            console.log(msg, variable === undefined ? '' : 
                (typeof variable === 'object' ? JSON.stringify(variable) : variable));
        }
    }

    errorHandler(error, from = 'dkedu_assessmentQuestionRecord') {
        if (error.body !== undefined) {
            this.showToast('Error', from + ' -> ' + error.body.message, 'error');
        } else if (error.message !== undefined) {
            this.showToast('Error', from + ' -> ' + error.message, 'error');
        } else if (typeof error === 'string') {
            this.showToast('Error', from + ' -> ' + error, 'error');
        } else {
            console.error('Unknown error -> ', error);
            this.showToast('Error', 'Unknown error in javascript controller/helper.', 'error');
        }
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    get questionTypeOptions() {
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
    }

    get showChoiceOptions() {
        // Show choice options for question types that require multiple options
        // These are typically choice-based question types
        const choiceBasedTypes = ['Choosable', 'MultiChoosable', 'ê°ê´€ì‹ (ë‹¨ì¼ì„ íƒ)', 'ê°ê´€ì‹ (ë‹¤ì¤‘ì„ íƒ)'];
        return choiceBasedTypes.includes(this.selectedQuestionType);
    }

    get isOnlyOneChoice() {
        return this.choiceOptions.length <= 1;
    }

    get parentQuestionChoices() {
        if (!this.selectedParentQuestion || !this.isParentQuestionChoiceBased || !this.parentQuestionItems || this.parentQuestionItems.length === 0) {
            this.log('parentQuestionChoices - early return', {
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
        
        this.log('parentQuestionChoices - returning choices', {
            parentQuestionItems: this.parentQuestionItems,
            choices: choices,
            selectedConditionValue: this.selectedConditionValue
        });
        
        return choices;
    }

    get isParentQuestionChoiceBased() {
        if (!this.selectedParentQuestion) {
            return false;
        }
        
        const choiceBasedTypes = ['Choosable', 'MultiChoosable', 'ê°ê´€ì‹ (ë‹¨ì¼ì„ íƒ)', 'ê°ê´€ì‹ (ë‹¤ì¤‘ì„ íƒ)'];
        return choiceBasedTypes.includes(this.selectedParentQuestion.Type__c);
    }

    async connectedCallback() {
        this.log('connectedCallback ì‹œìž‘', '');
        
        this.fullReset();
        
        try {
            this.parentQuestions = await getAssessmentQuestions();
            this.filteredParentQuestions = [...this.parentQuestions];
            this.log('ë¶€ëª¨ ì§ˆë¬¸ ë¡œë”© ì™„ë£Œ', this.parentQuestions.length);
        } catch (error) {
            this.log('ë¶€ëª¨ ì§ˆë¬¸ ë¡œë”© ì—ëŸ¬', error);
            this.parentQuestions = [];
            this.filteredParentQuestions = [];
            this.errorHandler(error, 'connectedCallback');
        }
        
        this.log('connectedCallback ì¢…ë£Œ', '');
    }

    renderedCallback() {
        if (!this._hasInitialized) {
            this.log('renderedCallback - ì²« ë Œë”ë§ ì´ˆê¸°í™”', '');
            this._hasInitialized = true;
            
            // DOMì´ ì™„ì „ížˆ ë Œë”ë§ëœ í›„ ìž…ë ¥ í•„ë“œ ì´ˆê¸°í™”
            setTimeout(() => {
                this.clearDOMFields();
            }, 0);
        }
    }

    disconnectedCallback() {
        this.log('disconnectedCallback - ì»´í¬ë„ŒíŠ¸ ì–¸ë§ˆìš´íŠ¸', '');
        this._hasInitialized = false;
    }

    initializeChoiceOptions() {
        if (this.showChoiceOptions && this.choiceOptions.length === 0) {
            this.formState.choiceOptions = [
                { id: this.generateId(), value: '', placeholder: this.generateOptionPlaceholder(1) },
                { id: this.generateId(), value: '', placeholder: this.generateOptionPlaceholder(2) }
            ];
        }
    }

    generateId() {
        return `choice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    handleQuestionTypeChange(event) {
        this.log('handleQuestionTypeChange', event.target.value);
        this.formState = {
            ...this.formState,
            selectedQuestionType: event.target.value
        };
        
        if (this.showChoiceOptions && this.choiceOptions.length === 0) {
            this.initializeChoiceOptions();
        } else if (!this.showChoiceOptions) {
            this.formState.choiceOptions = [];
        }
    }

    handleQuestionTextChange(event) {
        this.log('handleQuestionTextChange', event.target.value);
        this.formState = {
            ...this.formState,
            questionText: event.target.value
        };
    }

    handleChoiceChange(event) {
        const index = parseInt(event.target.dataset.index, 10);
        const newChoiceOptions = [...this.choiceOptions];
        newChoiceOptions[index] = {
            ...newChoiceOptions[index],
            value: event.target.value
        };
        this.formState = {
            ...this.formState,
            choiceOptions: newChoiceOptions
        };
        this.log('handleChoiceChange', { index, value: event.target.value });
    }

    addChoice() {
        this.log('addChoice', '');
        const newChoice = {
            id: this.generateId(),
            value: '',
            placeholder: this.generateOptionPlaceholder(this.choiceOptions.length + 1)
        };
        this.formState = {
            ...this.formState,
            choiceOptions: [...this.choiceOptions, newChoice]
        };
    }

    removeChoice(event) {
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
            this.formState = {
                ...this.formState,
                choiceOptions: reindexed
            };
            this.log('removeChoice ì™„ë£Œ', { newCount: reindexed.length });
        }
    }

    handleRelatedQuestionToggle(event) {
        this.log('handleRelatedQuestionToggle', event.target.checked);
        this.formState = {
            ...this.formState,
            isRelatedQuestionEnabled: event.target.checked
        };
        
        if (!event.target.checked) {
            this.formState = {
                ...this.formState,
                selectedParentQuestion: null,
                parentQuestionSearchTerm: '',
                selectedConditionValue: '',
                parentQuestionItems: []
            };
            this.filteredParentQuestions = [...this.parentQuestions];
        }
    }

    handleParentQuestionSearch(event) {
        this.formState = {
            ...this.formState,
            parentQuestionSearchTerm: event.target.value,
            isParentQuestionDropdownOpen: true
        };
        this.log('handleParentQuestionSearch', event.target.value);
        this.filterParentQuestions();
    }

    filterParentQuestions() {
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
    }

    handleParentQuestionFocus() {
        this.formState = {
            ...this.formState,
            isParentQuestionDropdownOpen: true
        };
    }

    handleParentQuestionBlur(event) {
        // relatedTarget í™•ì¸ - í´ë¦­í•œ ê³³ì´ ë“œë¡­ë‹¤ìš´ ë‚´ë¶€ì¸ì§€ í™•ì¸
        setTimeout(() => {
            // ë§ˆìš°ìŠ¤ê°€ ë“œë¡­ë‹¤ìš´ ìœ„ì— ìžˆëŠ”ì§€ í™•ì¸
            const dropdown = this.template.querySelector('.slds-dropdown');
            if (dropdown && dropdown.matches(':hover')) {
                return; // ë“œë¡­ë‹¤ìš´ ìœ„ì— ë§ˆìš°ìŠ¤ê°€ ìžˆìœ¼ë©´ ë‹«ì§€ ì•ŠìŒ
            }
            
            this.formState = {
                ...this.formState,
                isParentQuestionDropdownOpen: false
            };
        }, 150);
    }

    handleDropdownMouseEnter() {
        // ë“œë¡­ë‹¤ìš´ì— ë§ˆìš°ìŠ¤ê°€ ë“¤ì–´ì˜¤ë©´ ë‹«ížˆì§€ ì•Šë„ë¡ í”Œëž˜ê·¸ ì„¤ì •
        this._isMouseOverDropdown = true;
    }

    handleDropdownMouseLeave() {
        // ë“œë¡­ë‹¤ìš´ì—ì„œ ë§ˆìš°ìŠ¤ê°€ ë‚˜ê°€ë©´ í”Œëž˜ê·¸ í•´ì œ
        this._isMouseOverDropdown = false;
    }

    async selectParentQuestion(event) {
        const questionId = event.currentTarget.dataset.questionId;
        const selectedQuestion = this.parentQuestions.find(q => q.Id === questionId);
        
        this.log('selectParentQuestion', { questionId, selectedQuestion });
        
        if (selectedQuestion) {
            this.formState = {
                ...this.formState,
                selectedParentQuestion: selectedQuestion,
                parentQuestionSearchTerm: selectedQuestion.Question__c,
                selectedConditionValue: '',
                isParentQuestionDropdownOpen: false
            };
            
            if (this.isParentQuestionChoiceBased) {
                await this.loadParentQuestionItems(questionId);
            } else {
                this.formState = {
                    ...this.formState,
                    parentQuestionItems: []
                };
            }
        }
    }

    handleConditionValueChange(event) {
        this.formState = {
            ...this.formState,
            selectedConditionValue: event.target.value
        };
        this.log('handleConditionValueChange', event.target.value);
    }

    handleImageToggle(event) {
        this.log('handleImageToggle', event.target.checked);
        this.formState = {
            ...this.formState,
            isImageEnabled: event.target.checked
        };
    }

    async loadParentQuestionItems(questionId) {
        this.log('loadParentQuestionItems ì‹œìž‘', questionId);
        
        if (!questionId) {
            this.formState = {
                ...this.formState,
                parentQuestionItems: []
            };
            return;
        }

        this.formState = {
            ...this.formState,
            isLoadingChoices: true
        };
        
        try {
            const items = await getAssessmentQuestionItems({ questionId: questionId });
            this.log('loadParentQuestionItems - raw items from Apex', items);
            
            this.formState = {
                ...this.formState,
                parentQuestionItems: items,
                isLoadingChoices: false
            };
            this.log('loadParentQuestionItems ì™„ë£Œ', { 
                items: items, 
                itemsLength: items ? items.length : 'null/undefined',
                formStateUpdated: this.parentQuestionItems
            });
        } catch (error) {
            this.log('loadParentQuestionItems ì—ëŸ¬', error);
            this.formState = {
                ...this.formState,
                parentQuestionItems: [],
                isLoadingChoices: false
            };
            this.errorHandler(error, 'loadParentQuestionItems');
        }
    }

    validateForm() {
        const errors = [];

        if (!this.selectedQuestionType) {
            errors.push('ì§ˆë¬¸ ìœ í˜•ì„ ì„ íƒí•´ì£¼ì„¸ìš”.');
        }

        if (!this.questionText.trim()) {
            errors.push('ì§ˆë¬¸ì„ ìž…ë ¥í•´ì£¼ì„¸ìš”.');
        }

        if (this.showChoiceOptions) {
            const filledChoices = this.choiceOptions.filter(choice => choice.value.trim());
            if (filledChoices.length < 2) {
                errors.push('ìµœì†Œ 2ê°œì˜ ì„ íƒì§€ë¥¼ ìž…ë ¥í•´ì£¼ì„¸ìš”.');
            }
        }

        if (this.isRelatedQuestionEnabled) {
            if (!this.selectedParentQuestion) {
                errors.push('ë¶€ëª¨ ì§ˆë¬¸ì„ ì„ íƒí•´ì£¼ì„¸ìš”.');
            }
            if (!this.selectedConditionValue) {
                errors.push('ì¡°ê±´ì„ ìž…ë ¥í•´ì£¼ì„¸ìš”.');
            }
        }

        return errors;
    }

    async handleSave() {
        this.log('handleSave ì‹œìž‘', '');
        
        const validationErrors = this.validateForm();
        this.log('ê²€ì¦ ê²°ê³¼', validationErrors);
        
        if (validationErrors.length > 0) {
            this.showToast('Validation Error', validationErrors.join(', '), 'error');
            return;
        }

        this.formState = {
            ...this.formState,
            isLoading: true
        };

        try {
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

            this.log('ì§ˆë¬¸ ë°ì´í„° ì¤€ë¹„ ì™„ë£Œ', questionData);

            const response = await createAssessmentQuestion({ questionData: JSON.stringify(questionData) });
            const result = JSON.parse(response);
            this.log('ì €ìž¥ ê²°ê³¼', result);

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
            this.formState = {
                ...this.formState,
                isLoading: false
            };
        }
    }

    handleCancel() {
        this.log('handleCancel', '');
        this.fullReset();
        this.closeModal();
    }

    closeModal() {
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
    }

    fullReset() {
        this.log('fullReset - ì™„ì „ ì´ˆê¸°í™”', '');
        
        // ìƒˆë¡œìš´ formState ê°ì²´ ìƒì„± (ì°¸ì¡° ë³€ê²½)
        this.formState = {
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
        
        // renderKey ì¦ê°€ë¡œ ì „ì²´ ìž¬ë Œë”ë§
        this.renderKey = this.renderKey + 1;
        
        // DOM í•„ë“œ ì´ˆê¸°í™”
        setTimeout(() => {
            this.clearDOMFields();
        }, 0);
        
        this.log('fullReset ì™„ë£Œ', { renderKey: this.renderKey });
    }

    async handleSaveAndNew() {
        this.log('handleSaveAndNew ì‹œìž‘', '');
        
        const validationErrors = this.validateForm();
        this.log('ê²€ì¦ ê²°ê³¼', validationErrors);
        
        if (validationErrors.length > 0) {
            this.showToast('Validation Error', validationErrors.join(', '), 'error');
            return;
        }

        this.formState = {
            ...this.formState,
            isLoading: true
        };

        try {
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

            this.log('ì§ˆë¬¸ ë°ì´í„° ì¤€ë¹„ ì™„ë£Œ', questionData);

            const response = await createAssessmentQuestion({ questionData: JSON.stringify(questionData) });
            const result = JSON.parse(response);
            this.log('ì €ìž¥ ê²°ê³¼', result);

            if (result.success) {
                this.showToast('Success', result.message + ' - ìƒˆ ì§ˆë¬¸ì„ ìž‘ì„±í•  ìˆ˜ ìžˆìŠµë‹ˆë‹¤.', 'success');
                
                // ë¶€ëª¨ ì§ˆë¬¸ ëª©ë¡ ìƒˆë¡œê³ ì¹¨ (ë°©ê¸ˆ ì €ìž¥í•œ ì§ˆë¬¸ì´ ë¶€ëª¨ ì§ˆë¬¸ìœ¼ë¡œ ì‚¬ìš©ë  ìˆ˜ ìžˆë„ë¡)
                try {
                    this.parentQuestions = await getAssessmentQuestions();
                    this.filteredParentQuestions = [...this.parentQuestions];
                } catch (error) {
                    this.log('ë¶€ëª¨ ì§ˆë¬¸ ìƒˆë¡œê³ ì¹¨ ì—ëŸ¬', error);
                }
                
                // í¼ ì´ˆê¸°í™” (ëª¨ë‹¬ì€ ë‹«ì§€ ì•ŠìŒ)
                this.fullReset();
            } else {
                this.showToast('Error', result.message, 'error');
            }

        } catch (error) {
            this.errorHandler(error, 'handleSaveAndNew');
        } finally {
            this.formState = {
                ...this.formState,
                isLoading: false
            };
        }
    }

    clearDOMFields() {
        this.log('clearDOMFields ì‹œìž‘', '');
        
        try {
            const inputs = this.template.querySelectorAll('input[type="text"], input[type="checkbox"], textarea, select');
            inputs.forEach(input => {
                if (input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            });
            this.log('clearDOMFields ì™„ë£Œ', inputs.length);
        } catch (error) {
            this.log('clearDOMFields ì—ëŸ¬', error);
        }
    }
}