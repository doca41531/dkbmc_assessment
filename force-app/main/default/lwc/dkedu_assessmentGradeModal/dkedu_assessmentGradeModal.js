/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
**/

/**
 * @description       : Lightning Modal Assessment Grade Component
 * @author            : Salesforce Consultant
 * @last modified on  : 2025-11-17
**/
import { api, track } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex Methods
import createAssessmentGrade from '@salesforce/apex/DKEDU_AssessmentGradeController.createAssessmentGrade';

const DEBUG = true;

export default class DkeduAssessmentGradeModal extends LightningModal {
    @api parentRecordId;
    
    @track isLoading = false;
    @track formData = {
        gradeName: '',
        isActive: true,
        gradeItems: []
    };
    
    _isInitialized = false;
    _gradeItemIdCounter = 0;
    
    // Computed properties
    get hasGradeItems() {
        return Array.isArray(this.formData.gradeItems) && this.formData.gradeItems.length > 0;
    }
    
    get isOnlyOneGradeItem() {
        return this.formData.gradeItems?.length <= 1;
    }
    
    // Lifecycle
    connectedCallback() {
        try {
            this.log('connectedCallback', 'Starting');
            this.initializeForm();
            this._isInitialized = true;
            this.log('connectedCallback', 'Completed');
        } catch (error) {
            this.handleError(error, 'connectedCallback');
        }
    }
    
    initializeForm() {
        try {
            this.formData = {
                gradeName: '',
                isActive: true,
                gradeItems: [this.createNewGradeItem()]
            };
            this.log('Form initialized with default grade item');
        } catch (error) {
            this.handleError(error, 'initializeForm');
        }
    }
    
    createNewGradeItem() {
        try {
            return {
                id: `item_${++this._gradeItemIdCounter}`,
                gradeName: '',
                lowestScore: null,
                highestScore: null
            };
        } catch (error) {
            this.handleError(error, 'createNewGradeItem');
            return {
                id: `item_fallback_${Date.now()}`,
                gradeName: '',
                lowestScore: null,
                highestScore: null
            };
        }
    }
    
    // Event Handlers
    handleFieldChange(event) {
        try {
            const fieldName = event.target.dataset?.field;
            if (!fieldName) return;
            
            let value = event.target.value;
            if (event.target.type === 'checkbox') {
                value = event.target.checked;
            }
            
            this.formData = {
                ...this.formData,
                [fieldName]: value
            };
            
            this.log('Field changed', { fieldName, value });
        } catch (error) {
            this.handleError(error, 'handleFieldChange');
        }
    }
    
    handleGradeItemChange(event) {
        try {
            const index = parseInt(event.target.dataset?.index, 10);
            const field = event.target.dataset?.field;
            
            if (isNaN(index) || !field) return;
            
            let value = event.target.value;
            if (field === 'lowestScore' || field === 'highestScore') {
                value = value ? parseFloat(value) : null;
            }
            
            const updatedItems = [...this.formData.gradeItems];
            if (updatedItems[index]) {
                updatedItems[index] = {
                    ...updatedItems[index],
                    [field]: value
                };
                
                this.formData = {
                    ...this.formData,
                    gradeItems: updatedItems
                };
            }
            
            this.log('Grade item changed', { index, field, value });
        } catch (error) {
            this.handleError(error, 'handleGradeItemChange');
        }
    }
    
    addGradeItem() {
        try {
            const newItem = this.createNewGradeItem();
            const updatedItems = [...this.formData.gradeItems, newItem];
            
            this.formData = {
                ...this.formData,
                gradeItems: updatedItems
            };
            
            this.log('Grade item added', newItem);
        } catch (error) {
            this.handleError(error, 'addGradeItem');
        }
    }
    
    removeGradeItem(event) {
        try {
            const index = parseInt(event.target.dataset?.index, 10);
            if (isNaN(index)) return;
            
            if (this.formData.gradeItems.length <= 1) {
                this.showToast('Warning', 'At least one grade item is required.', 'warning');
                return;
            }
            
            const updatedItems = this.formData.gradeItems.filter((_, idx) => idx !== index);
            
            this.formData = {
                ...this.formData,
                gradeItems: updatedItems
            };
            
            this.log('Grade item removed at index', index);
        } catch (error) {
            this.handleError(error, 'removeGradeItem');
        }
    }
    
    // Template Methods
    applyStandardGradeTemplate() {
        try {
            const standardGrades = [
                { gradeName: 'A+', lowestScore: 97, highestScore: 100 },
                { gradeName: 'A', lowestScore: 93, highestScore: 96.9 },
                { gradeName: 'A-', lowestScore: 90, highestScore: 92.9 },
                { gradeName: 'B+', lowestScore: 87, highestScore: 89.9 },
                { gradeName: 'B', lowestScore: 83, highestScore: 86.9 },
                { gradeName: 'B-', lowestScore: 80, highestScore: 82.9 },
                { gradeName: 'C+', lowestScore: 77, highestScore: 79.9 },
                { gradeName: 'C', lowestScore: 73, highestScore: 76.9 },
                { gradeName: 'C-', lowestScore: 70, highestScore: 72.9 },
                { gradeName: 'D', lowestScore: 60, highestScore: 69.9 },
                { gradeName: 'F', lowestScore: 0, highestScore: 59.9 }
            ];
            
            this.applyTemplate(standardGrades, 'Standard A-F Grade');
        } catch (error) {
            this.handleError(error, 'applyStandardGradeTemplate');
        }
    }
    
    applyPassFailTemplate() {
        try {
            const passFailGrades = [
                { gradeName: 'Pass', lowestScore: 70, highestScore: 100 },
                { gradeName: 'Fail', lowestScore: 0, highestScore: 69.9 }
            ];
            
            this.applyTemplate(passFailGrades, 'Pass/Fail Grade');
        } catch (error) {
            this.handleError(error, 'applyPassFailTemplate');
        }
    }
    
    applyExcellentTemplate() {
        try {
            const excellentGrades = [
                { gradeName: 'Excellent', lowestScore: 90, highestScore: 100 },
                { gradeName: 'Good', lowestScore: 70, highestScore: 89.9 },
                { gradeName: 'Satisfactory', lowestScore: 50, highestScore: 69.9 },
                { gradeName: 'Poor', lowestScore: 0, highestScore: 49.9 }
            ];
            
            this.applyTemplate(excellentGrades, 'Excellent/Good/Poor Grade');
        } catch (error) {
            this.handleError(error, 'applyExcellentTemplate');
        }
    }
    
    applyTemplate(gradeItems, templateName) {
        try {
            const templatedItems = gradeItems.map((item, index) => ({
                id: `template_${++this._gradeItemIdCounter}`,
                ...item
            }));
            
            this.formData = {
                ...this.formData,
                gradeItems: templatedItems,
                gradeName: this.formData.gradeName || templateName
            };
            
            this.log('Template applied', templateName);
            this.showToast('Success', `${templateName} template applied!`, 'success');
        } catch (error) {
            this.handleError(error, `applyTemplate - ${templateName}`);
        }
    }
    
    // Validation
    validateForm() {
        try {
            const errors = [];
            
            // Basic validation
            if (!this.formData.gradeName?.trim()) {
                errors.push('Assessment Grade Name is required.');
            }
            
            // Grade items validation
            if (!this.hasGradeItems) {
                errors.push('At least one grade item is required.');
                return errors;
            }
            
            const validItems = [];
            let hasOverlap = false;
            
            // Validate each grade item
            this.formData.gradeItems.forEach((item, index) => {
                if (!item.gradeName?.trim()) {
                    errors.push(`Grade name is required for item ${index + 1}.`);
                }
                
                if (item.lowestScore === null || item.lowestScore === undefined) {
                    errors.push(`Lowest score is required for item ${index + 1}.`);
                }
                
                if (item.highestScore === null || item.highestScore === undefined) {
                    errors.push(`Highest score is required for item ${index + 1}.`);
                }
                
                if (item.lowestScore !== null && item.highestScore !== null) {
                    if (item.lowestScore >= item.highestScore) {
                        errors.push(`Lowest score must be less than highest score for "${item.gradeName || `Item ${index + 1}`}".`);
                    } else {
                        validItems.push({ ...item, index });
                    }
                }
            });
            
            // Check for overlapping ranges
            if (validItems.length > 1) {
                validItems.sort((a, b) => a.lowestScore - b.lowestScore);
                
                for (let i = 0; i < validItems.length - 1; i++) {
                    if (validItems[i].highestScore > validItems[i + 1].lowestScore) {
                        hasOverlap = true;
                        errors.push(`Score ranges overlap between "${validItems[i].gradeName}" and "${validItems[i + 1].gradeName}".`);
                        break;
                    }
                }
            }
            
            return errors;
        } catch (error) {
            this.handleError(error, 'validateForm');
            return ['Form validation error occurred.'];
        }
    }
    
    // Save Methods
    async handleSave() {
        try {
            if (this.isLoading) return;
            
            const result = await this.saveGrade(false);
            if (result?.success) {
                this.close(result);
            }
        } catch (error) {
            this.handleError(error, 'handleSave');
        }
    }
    
    async handleSaveAndNew() {
        try {
            if (this.isLoading) return;
            
            const result = await this.saveGrade(true);
            if (result?.success && result.saveAndNew) {
                this.resetForm();
            }
        } catch (error) {
            this.handleError(error, 'handleSaveAndNew');
        }
    }
    
    async saveGrade(saveAndNew = false) {
        try {
            const validationErrors = this.validateForm();
            
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(' '), 'error');
                return { success: false };
            }
            
            this.isLoading = true;
            
            const gradeData = this.buildGradeData();
            const response = await createAssessmentGrade({ 
                gradeData: JSON.stringify(gradeData) 
            });
            
            const result = JSON.parse(response);
            
            if (result.success) {
                const message = saveAndNew ? 
                    `${result.message || 'Grade saved successfully'} You can create another grade.` : 
                    (result.message || 'Grade saved successfully');
                    
                this.showToast('Success', message, 'success');
                
                return { 
                    success: true, 
                    saveAndNew,
                    gradeId: result.gradeId,
                    action: saveAndNew ? 'saveAndNew' : 'save'
                };
            } else {
                this.showToast('Error', result.message || 'Unknown server error', 'error');
                return { success: false };
            }
            
        } catch (error) {
            this.handleError(error, 'saveGrade');
            return { success: false };
        } finally {
            this.isLoading = false;
        }
    }
    
    buildGradeData() {
        try {
            return {
                gradeName: this.formData.gradeName?.trim() || '',
                isActive: Boolean(this.formData.isActive),
                gradeItems: this.formData.gradeItems.map(item => ({
                    gradeName: item.gradeName?.trim() || '',
                    lowestScore: item.lowestScore,
                    highestScore: item.highestScore
                }))
            };
        } catch (error) {
            this.handleError(error, 'buildGradeData');
            return null;
        }
    }
    
    resetForm() {
        try {
            this.initializeForm();
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
            this.close({ action: 'force_close', success: false });
        }
    }
    
    // Utility Methods
    log(message, data) {
        if (DEBUG) {
            console.log(`[DkeduAssessmentGradeModal] ${message}`, data || '');
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
            this.showToast('Critical Error', 'A critical error occurred. Please refresh the page.', 'error');
        }
    }
    
    showToast(title, message, variant) {
        try {
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