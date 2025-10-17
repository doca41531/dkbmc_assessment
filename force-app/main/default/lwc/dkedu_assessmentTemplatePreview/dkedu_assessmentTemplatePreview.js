/**
 * @description Assessment Template Preview Component - DKEDU (Fixed Version)
 * @author mingyu.park@dkbmc.com
 * @group DKEDU Components  
 * @created date 2025-10-17
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.0.1
 */

import { LightningElement, api, wire, track } from 'lwc';
import getAssessmentPreviewData from '@salesforce/apex/DKEDU_AssessmentPreviewController.getAssessmentPreviewData';

export default class DkeduAssessmentTemplatePreview extends LightningElement {
    @api recordId;
    
    @track assessmentData;
    @track isLoading = true;
    @track error;

    @wire(getAssessmentPreviewData, { templateId: '$recordId' })
    wiredAssessmentData({ error, data }) {
        this.isLoading = true;
        
        if (data) {
            console.log('Raw data from Apex:', data);
            
            // 데이터 처리 및 isRelatedQuestion 속성 추가
            this.assessmentData = {
                template: data.template,
                sections: data.sections.map(section => ({
                    ...section,
                    Questions: section.Questions.map(question => ({
                        ...question,
                        // isRelatedQuestion 속성이 Apex에서 이미 설정되어 있는지 확인하고, 없으면 false로 설정
                        isRelatedQuestion: question.isRelatedQuestion || false,
                        relatedCriteria: question.relatedCriteria || '',
                        parentQuestionText: question.parentQuestionText || ''
                    }))
                }))
            };
            
            console.log('Processed assessment data:', this.assessmentData);
            this.error = undefined;
        } else if (error) {
            console.error('Error loading assessment data:', error);
            this.error = error;
            this.assessmentData = undefined;
        }
        
        this.isLoading = false;
    }

    get hasData() {
        return this.assessmentData && 
               this.assessmentData.sections && 
               this.assessmentData.sections.length > 0;
    }

    get noDataMessage() {
        if (this.isLoading) {
            return 'Loading...';
        }
        if (this.error) {
            return 'Error loading data';
        }
        return 'No assessment data available for this template.';
    }


}