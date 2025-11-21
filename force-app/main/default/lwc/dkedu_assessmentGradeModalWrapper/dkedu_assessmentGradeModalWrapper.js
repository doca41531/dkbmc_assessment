/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
**/

/**
 * @description       : Wrapper component to launch Assessment Grade Modal from Aura
 * @author            : salesforce.consultant@company.com
 * @group             : Assessment Management
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
**/
import { LightningElement, api } from 'lwc';
import DkeduAssessmentGradeModal from 'c/dkedu_assessmentGradeModal';

export default class DkeduAssessmentGradeModalWrapper extends LightningElement {
    @api parentRecordId;
    
    connectedCallback() {
        console.log('Grade Modal Wrapper connected with parentRecordId:', this.parentRecordId);
        this.openModal();
    }
    
    async openModal() {
        try {
            console.log('Opening Assessment Grade Modal...');
            
            const result = await DkeduAssessmentGradeModal.open({
                size: 'medium',
                parentRecordId: this.parentRecordId,
                mode: 'new'
            });
            
            console.log('Grade Modal closed with result:', result);
            
            if (result && result.success) {
                console.log('Grade Modal completed successfully');
                this.navigateToList();
            } else {
                console.log('Grade Modal cancelled or failed');
                this.navigateBack();
            }
        } catch (error) {
            console.error('Error opening grade modal:', error);
            this.navigateBack();
        }
    }
    
    navigateToList() {
        console.log('Navigating to grade list...');
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'list',
                success: true
            }
        });
        this.dispatchEvent(navEvent);
    }
    
    navigateBack() {
        console.log('Navigating back...');
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'back',
                success: false
            }
        });
        this.dispatchEvent(navEvent);
    }
}
