/**
 * @description       : Assessment Template Component with Question Score Setting - DKEDU
 * @author            : developer@company.com
 * @group             : DKEDU Components  
 * @created date      : 2025-01-15
 * @last modified on  : 2025-10-15
 * @last modified by  : mingyu.park@dkbmc.com
 * @version           : 1.2.0
 */

import { LightningElement, track, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAvailableQuestions from '@salesforce/apex/DKEDU_AssessmentTemplateController.getAvailableQuestions';
import createAssessmentTemplate from '@salesforce/apex/DKEDU_AssessmentTemplateController.createAssessmentTemplate';
import getQuestionTypes from '@salesforce/apex/DKEDU_AssessmentTemplateController.getQuestionTypes';
import getQuestionItems from '@salesforce/apex/DKEDU_AssessmentTemplateController.getQuestionItems';

export default class Dkedu_assessmentTemplate extends NavigationMixin(LightningElement) {
    
    static DEBUG = true;
    _hasInitialized = false;
    
    @api recordId;
    @api objectApiName;
    
    // Form data properties
    @track templateName = '';
    @track description = '';
    @track isActive = true;
    @track sessions = [];
    @track renderKey = 0;
    @track isLoading = false;
    
    // Step management
    @track currentStep = 1; // 1: Template & Questions, 2: Question Scores
    @track currentSessionIndex = 0;
    
    // Data from Salesforce
    @track availableQuestions = [];
    @track questionTypes = [];
    @track questionItems = {}; // questionId를 키로 하는 선택지 맵
    
    // Global selection state
    @track globalSelection = {
        sessionId: null,
        listType: null,
        questionId: null
    };
    
    sessionCounter = 0;
    
    // Wire methods
    @wire(getAvailableQuestions)
    wiredQuestions({ error, data }) {
        if (data) {
            this.availableQuestions = data.map(question => ({
                id: question.Id,
                text: question.Question__c || question.Name,
                type: question.Type__c || 'Unknown',
                isActive: question.IsActive__c,
                fileIncluded: question.FileIncluded__c,
                hasRelatedQuestion: question.HasRelatedQuestion__c
            }));
            this.log('Available questions loaded', this.availableQuestions.length);
            this.updateSessionsWithNewQuestions();
        } else if (error) {
            this.errorHandler(error, 'wiredQuestions');
            this.availableQuestions = [];
        }
    }
    
    @wire(getQuestionTypes)
    wiredQuestionTypes({ error, data }) {
        if (data) {
            this.questionTypes = data;
            this.log('Question types loaded', this.questionTypes.length);
        } else if (error) {
            this.errorHandler(error, 'wiredQuestionTypes');
            this.questionTypes = [];
        }
    }
    
    // Getters for template visibility
    get isStep1() {
        return this.currentStep === 1;
    }
    
    get isStep2() {
        return this.currentStep === 2;
    }
    
    get currentSession() {
        return this.sessions[this.currentSessionIndex] || null;
    }
    
    get currentSessionName() {
        return this.currentSession ? this.currentSession.name : '';
    }
    
    get currentSessionQuestions() {
        if (!this.currentSession) return [];
        
        return this.currentSession.selectedQuestions.map(q => {
            const questionItems = this.questionItems[q.id] || [];
            const isMultipleChoice = q.type === 'Choosable' || q.type === 'Multi-Choosable';
            
            return {
                ...q,
                isMultipleChoice: isMultipleChoice,
                questionItems: questionItems,
                totalItemScore: this.calculateTotalItemScore(q.id)
            };
        });
    }
    
    get sessionProgress() {
        return `${this.currentSessionIndex + 1} / ${this.sessions.length}`;
    }
    
    get isLastSession() {
        return this.currentSessionIndex >= this.sessions.length - 1;
    }
    
    get totalSessionScore() {
        return this.currentSession ? parseFloat(this.currentSession.score || 0) : 0;
    }
    
    get currentQuestionsTotalScore() {
        if (!this.currentSession) return 0;
        
        return this.currentSession.selectedQuestions.reduce((total, q) => {
            return total + parseFloat(q.score || 0);
        }, 0);
    }
    
    get isScoreBalanced() {
        return Math.abs(this.totalSessionScore - this.currentQuestionsTotalScore) < 0.01;
    }
    
    get isSingleSession() {
        return this.sessions.length <= 1;
    }
    
    // Utility methods
    log(msg, variable) {
        if (Dkedu_assessmentTemplate.DEBUG) {
            console.log(`[Dkedu_assessmentTemplate] ${msg}`, variable === undefined ? '' : 
                (typeof variable === 'object' ? JSON.stringify(variable, null, 2) : variable));
        }
    }

    errorHandler(error, from = 'Dkedu_assessmentTemplate') {
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
    
    @api
    openModal() {
        this.log('Modal opened');
        this._hasInitialized = false;
        
        // Initialize to step 1
        this.currentStep = 1;
        this.currentSessionIndex = 0;
        
        // Reset form data
        this.templateName = '';
        this.description = '';
        this.isActive = true;
        this.sessions = [];
        this.globalSelection = { sessionId: null, listType: null, questionId: null };
        this.isLoading = false;
        this.sessionCounter = 0;
        this.questionItems = {};
        
        this.renderKey = this.renderKey + 1;
        this.addInitialSession();
        
        this.log('Modal opened and initialized');
    }
    
    connectedCallback() {
        this.log('Component connected');
    }

    renderedCallback() {
        if (!this._hasInitialized) {
            this.log('First render initialization');
            this._hasInitialized = true;
        }
        
        if (this.sessions.length === 0 && this.currentStep === 1) {
            this.log('No sessions found, adding initial session');
            this.addInitialSession();
        }
    }

    disconnectedCallback() {
        this.log('Component disconnected');
        this._hasInitialized = false;
    }
    
    generateId() {
        return `session_${++this.sessionCounter}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    updateSessionsWithNewQuestions() {
        if (this.sessions.length > 0 && this.availableQuestions.length > 0) {
            this.sessions.forEach(session => {
                session.availableQuestions = [...this.availableQuestions];
                session.filteredAvailableQuestions = [...this.availableQuestions].map(q => ({
                    ...q,
                    cssClass: this.getQuestionCssClass(session.id, 'available', q.id)
                }));
            });
            this.log('[DEBUG] Sessions updated without array replacement');
        } else if (this.sessions.length === 0 && this.availableQuestions.length > 0) {
            this.addInitialSession();
        }
    }
    
    // Event Handlers - Step 1
    handleTemplateNameChange(event) {
        this.templateName = event.target.value;
        this.log('Template name changed', this.templateName);
    }

    handleDescriptionChange(event) {
        this.description = event.target.value;
        this.log('Description changed', this.description);
    }

    handleCheckboxChange(event) {
        const fieldName = event.target.id;
        const baseFieldName = fieldName.includes('-') ? fieldName.split('-')[0] : fieldName;
        
        const allowedFields = ['isActive'];
        
        if (allowedFields.includes(baseFieldName)) {
            this[baseFieldName] = event.target.checked;
            this.log(`${baseFieldName} changed to ${event.target.checked} (original ID: ${fieldName})`);
        } else {
            this.log(`Unauthorized field change attempt: ${fieldName} (base: ${baseFieldName})`);
            console.warn(`[Security] Unauthorized checkbox field: ${fieldName}`);
        }
    }

    handleSessionNameChange(event) {
        const sessionId = event.target.dataset.sessionId;
        const newName = event.target.value;
        
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.name = newName;
            this.log('Session name changed', { sessionId, newName });
        }
    }

    handleSessionScoreChange(event) {
        const sessionId = event.target.dataset.sessionId;
        const newScore = event.target.value;
        
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.score = newScore;
            this.log('Session score changed', { sessionId, newScore });
        }
    }
    
    addSession() {
        this.sessionCounter++;
        const sessionId = this.generateId();
        
        const newSession = {
            id: sessionId,
            name: `Session ${this.sessions.length + 1}`,
            nameInputId: `sessionName_${sessionId}`,
            scoreInputId: `sessionScore_${sessionId}`,
            score: '',
            selectedQuestions: [],
            availableQuestions: [...this.availableQuestions],
            filteredAvailableQuestions: [...this.availableQuestions].map(q => ({
                ...q,
                cssClass: 'listbox-item'
            })),
            searchTerm: ''
        };
        
        this.sessions = [...this.sessions, newSession];
        this.log('Session added', { sessionId, totalSessions: this.sessions.length });
    }
    
    removeSession(event) {
        const sessionId = event.currentTarget.dataset.sessionId;
        this.log('Remove session requested', sessionId);
        
        if (this.sessions.length <= 1) {
            this.showToast('Warning', 'At least one session is required.', 'warning');
            return;
        }
        
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
        
        if (this.globalSelection.sessionId === sessionId) {
            this.globalSelection = { sessionId: null, listType: null, questionId: null };
        }
        
        this.showToast('Success', 'Session deleted successfully.', 'success');
        this.log('Session removed', { sessionId, remainingSessions: this.sessions.length });
    }
    
    handleSearch(event) {
        const sessionId = event.target.dataset.sessionId;
        const searchTerm = event.target.value.toLowerCase();
        
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.searchTerm = searchTerm;
            session.filteredAvailableQuestions = session.availableQuestions
                .filter(q => !searchTerm || q.text.toLowerCase().includes(searchTerm))
                .map(q => ({
                    ...q,
                    cssClass: this.getQuestionCssClass(sessionId, 'available', q.id)
                }));
            
            if (this.globalSelection.sessionId === sessionId && 
                this.globalSelection.listType === 'available') {
                const stillVisible = session.filteredAvailableQuestions.find(q => q.id === this.globalSelection.questionId);
                if (!stillVisible) {
                    this.globalSelection = { sessionId: null, listType: null, questionId: null };
                }
            }
            
            this.log('Search performed', { sessionId, searchTerm, resultsCount: session.filteredAvailableQuestions.length });
        }
    }
    
    handleListboxClick(event) {
        if (event.target.classList.contains('listbox-item')) {
            const questionId = event.target.dataset.id;
            const sessionId = event.currentTarget.dataset.sessionId;
            const listType = event.currentTarget.dataset.listType;
            
            this.clearAllSelections();
            
            this.globalSelection = {
                sessionId: sessionId,
                listType: listType,
                questionId: questionId
            };
            
            this.updateSelectionDisplay();
            this.log('Question selected', this.globalSelection);
        }
    }
    
    clearAllSelections() {
        this.sessions = this.sessions.map(session => ({
            ...session,
            filteredAvailableQuestions: session.filteredAvailableQuestions.map(q => ({
                ...q,
                cssClass: 'listbox-item'
            })),
            selectedQuestions: session.selectedQuestions.map(q => ({
                ...q,
                cssClass: 'listbox-item'
            }))
        }));
    }
    
    updateSelectionDisplay() {
        this.sessions = this.sessions.map(session => ({
            ...session,
            filteredAvailableQuestions: session.filteredAvailableQuestions.map(q => ({
                ...q,
                cssClass: this.getQuestionCssClass(session.id, 'available', q.id)
            })),
            selectedQuestions: session.selectedQuestions.map(q => ({
                ...q,
                cssClass: this.getQuestionCssClass(session.id, 'selected', q.id)
            }))
        }));
    }
    
    getQuestionCssClass(sessionId, listType, questionId) {
        const isSelected = this.globalSelection.sessionId === sessionId && 
                          this.globalSelection.listType === listType && 
                          this.globalSelection.questionId === questionId;
        return isSelected ? 'listbox-item selected' : 'listbox-item';
    }
    
    moveToSelected(event) {
        const sessionId = event.currentTarget.dataset.sessionId;
        
        if (!this.globalSelection.questionId || 
            this.globalSelection.sessionId !== sessionId || 
            this.globalSelection.listType !== 'available') {
            this.showToast('Warning', 'Please select a question from Available Questions first.', 'warning');
            return;
        }

        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            const question = session.availableQuestions.find(q => q.id === this.globalSelection.questionId);
            
            if (question) {
                // Initialize question score
                const questionWithScore = { 
                    ...question, 
                    cssClass: 'listbox-item',
                    score: '' // 질문 점수 초기화
                };
                
                session.selectedQuestions = [...session.selectedQuestions, questionWithScore];
                session.availableQuestions = session.availableQuestions.filter(q => q.id !== this.globalSelection.questionId);
                session.filteredAvailableQuestions = session.filteredAvailableQuestions.filter(q => q.id !== this.globalSelection.questionId);
                
                this.globalSelection = { sessionId: null, listType: null, questionId: null };
                this.log('Question moved to selected', { sessionId, questionId: question.id });
            }
        }
    }

    moveToAvailable(event) {
        const sessionId = event.currentTarget.dataset.sessionId;
        
        if (!this.globalSelection.questionId || 
            this.globalSelection.sessionId !== sessionId || 
            this.globalSelection.listType !== 'selected') {
            this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
            return;
        }

        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            const question = session.selectedQuestions.find(q => q.id === this.globalSelection.questionId);
            
            if (question) {
                session.availableQuestions = [...session.availableQuestions, { ...question, cssClass: 'listbox-item' }];
                session.selectedQuestions = session.selectedQuestions.filter(q => q.id !== this.globalSelection.questionId);
                
                const searchTerm = session.searchTerm;
                session.filteredAvailableQuestions = session.availableQuestions
                    .filter(q => !searchTerm || q.text.toLowerCase().includes(searchTerm))
                    .map(q => ({ ...q, cssClass: 'listbox-item' }));
                
                this.globalSelection = { sessionId: null, listType: null, questionId: null };
                this.log('Question moved to available', { sessionId, questionId: question.id });
            }
        }
    }

    moveUp(event) {
        const sessionId = event.currentTarget.dataset.sessionId;
        
        if (!this.globalSelection.questionId || 
            this.globalSelection.sessionId !== sessionId || 
            this.globalSelection.listType !== 'selected') {
            this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
            return;
        }

        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            const currentIndex = session.selectedQuestions.findIndex(q => q.id === this.globalSelection.questionId);
            
            if (currentIndex > 0) {
                const updatedQuestions = [...session.selectedQuestions];
                [updatedQuestions[currentIndex - 1], updatedQuestions[currentIndex]] = 
                [updatedQuestions[currentIndex], updatedQuestions[currentIndex - 1]];
                
                session.selectedQuestions = updatedQuestions.map(q => ({
                    ...q,
                    cssClass: this.getQuestionCssClass(sessionId, 'selected', q.id)
                }));
                
                this.log('Question moved up', { sessionId, questionId: this.globalSelection.questionId });
            }
        }
    }

    moveDown(event) {
        const sessionId = event.currentTarget.dataset.sessionId;
        
        if (!this.globalSelection.questionId || 
            this.globalSelection.sessionId !== sessionId || 
            this.globalSelection.listType !== 'selected') {
            this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
            return;
        }

        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            const currentIndex = session.selectedQuestions.findIndex(q => q.id === this.globalSelection.questionId);
            
            if (currentIndex < session.selectedQuestions.length - 1) {
                const updatedQuestions = [...session.selectedQuestions];
                [updatedQuestions[currentIndex], updatedQuestions[currentIndex + 1]] = 
                [updatedQuestions[currentIndex + 1], updatedQuestions[currentIndex]];
                
                session.selectedQuestions = updatedQuestions.map(q => ({
                    ...q,
                    cssClass: this.getQuestionCssClass(sessionId, 'selected', q.id)
                }));
                
                this.log('Question moved down', { sessionId, questionId: this.globalSelection.questionId });
            }
        }
    }
    
    // Step 2 Event Handlers
    handleQuestionScoreChange(event) {
        const questionId = event.target.dataset.questionId;
        const newScore = event.target.value;
        const session = this.currentSession;
        
        if (session) {
            const question = session.selectedQuestions.find(q => q.id === questionId);
            if (question) {
                question.score = newScore;
                this.log('Question score changed', { questionId, newScore });
                
                // 선다형 질문인 경우 선택지 점수도 검증
                const isMultipleChoice = question.type === 'Choosable' || question.type === 'Multi-Choosable';
                if (isMultipleChoice) {
                    this.validateQuestionItemScoresRealtime(questionId);
                }
            }
        }
    }
    
    handleQuestionItemScoreChange(event) {
        const questionId = event.target.dataset.questionId;
        const itemId = event.target.dataset.itemId;
        const newScore = event.target.value;
        
        if (!this.questionItems[questionId]) {
            this.questionItems[questionId] = [];
        }
        
        // 해당 선택지 찾아서 점수 업데이트
        const item = this.questionItems[questionId].find(item => item.id === itemId);
        if (item) {
            item.score = newScore;
            this.log('Question item score changed', { questionId, itemId, newScore });
            
            // 실시간 검증: 선택지 점수가 질문 점수를 초과하는지 확인
            this.validateQuestionItemScoresRealtime(questionId);
        }
        
        // UI 강제 업데이트를 위해 currentSessionQuestions getter 재계산 트리거
        this.renderKey = this.renderKey + 1;
    }
    
    validateQuestionItemScoresRealtime(questionId) {
        const session = this.currentSession;
        if (!session) return;
        
        const question = session.selectedQuestions.find(q => q.id === questionId);
        const questionScore = parseFloat(question?.score || 0);
        const items = this.questionItems[questionId] || [];
        
        if (items.length > 0) {
            const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
            
            // 선택지 최대값이 질문 점수와 정확히 같아야 함
            if (maxItemScore !== questionScore) {
                this.showToast('Validation Error', 
                    `The highest item score (${maxItemScore}) must equal the question score (${questionScore}).`, 
                    'error');
            }
        }
        
        this.log('Real-time validation', { 
            questionId, 
            questionScore, 
            maxItemScore: items.length > 0 ? Math.max(...items.map(item => parseFloat(item.score || 0))) : 0,
            isValid: items.length === 0 || Math.max(...items.map(item => parseFloat(item.score || 0))) === questionScore
        });
    }
    
    calculateTotalItemScore(questionId) {
        if (!this.questionItems[questionId]) return 0;
        
        return this.questionItems[questionId].reduce((total, item) => {
            return total + parseFloat(item.score || 0);
        }, 0);
    }
    
    validateQuestionItemScores(questionId) {
        // 개별 검증은 제거, 로그만 남김
        const session = this.currentSession;
        if (!session) return;
        
        const question = session.selectedQuestions.find(q => q.id === questionId);
        const questionScore = parseFloat(question?.score || 0);
        const items = this.questionItems[questionId] || [];
        
        const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
        
        this.log('Question item scores validation', { 
            questionId, 
            questionScore, 
            maxItemScore,
            itemScores: items.map(item => ({ id: item.id, score: item.score }))
        });
    }
    
    // Navigation methods
    async handleNext() {
        this.log('Next button clicked');
        
        const validationErrors = this.validateStep1();
        if (validationErrors.length > 0) {
            this.showToast('Validation Error', validationErrors.join(' '), 'error');
            return;
        }
        
        // Load question items for multiple choice questions
        await this.loadQuestionItems();
        
        // Move to step 2
        this.currentStep = 2;
        this.currentSessionIndex = 0;
        
        this.log('Moved to step 2 - Question Scores');
    }
    
    handlePrevious() {
        if (this.currentStep === 2) {
            this.currentStep = 1;
            this.log('Moved back to step 1');
        }
    }
    
    handlePreviousSession() {
        if (this.currentSessionIndex > 0) {
            this.currentSessionIndex--;
            this.log('Moved to previous session', this.currentSessionIndex);
        }
    }
    
    handleNextSession() {
        const validationResult = this.validateCurrentSessionScores();
        
        // 에러가 있으면 진행 차단
        if (validationResult.errors.length > 0) {
            this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
            return;
        }
        
        if (this.currentSessionIndex < this.sessions.length - 1) {
            this.currentSessionIndex++;
            this.log('Moved to next session', this.currentSessionIndex);
        }
    }
    
    async loadQuestionItems() {
        // 선다형 질문들의 선택지를 로드
        const multipleChoiceQuestions = [];
        
        this.sessions.forEach(session => {
            session.selectedQuestions.forEach(question => {
                if (question.type === 'Choosable' || question.type === 'Multi-Choosable') {
                    multipleChoiceQuestions.push(question.id);
                }
            });
        });
        
        if (multipleChoiceQuestions.length > 0) {
            try {
                const result = await getQuestionItems({ questionIds: multipleChoiceQuestions });
                
                // 질문ID별로 선택지들을 그룹화
                this.questionItems = {}; // 초기화
                
                result.forEach(item => {
                    if (!this.questionItems[item.AssessmentQuestion__c]) {
                        this.questionItems[item.AssessmentQuestion__c] = [];
                    }
                    
                    this.questionItems[item.AssessmentQuestion__c].push({
                        id: item.Id,
                        name: item.Name,
                        content: item.Content__c,
                        order: item.Order__c,
                        score: '' // 초기 점수는 빈 값
                    });
                });
                
                // 선택지들을 Order 순으로 정렬
                Object.keys(this.questionItems).forEach(questionId => {
                    this.questionItems[questionId].sort((a, b) => a.order - b.order);
                });
                
                this.log('Question items loaded and sorted', this.questionItems);
            } catch (error) {
                this.errorHandler(error, 'loadQuestionItems');
            }
        }
    }
    
    // Validation methods
    validateStep1() {
        const errors = [];
        
        if (!this.templateName.trim()) {
            errors.push('Template Name is required.');
        }
        
        if (this.sessions.length === 0) {
            errors.push('At least one session is required.');
        }
        
        this.sessions.forEach((session, index) => {
            if (!session.name.trim()) {
                errors.push(`Session ${index + 1} name is required.`);
            }
            if (session.selectedQuestions.length === 0) {
                errors.push(`Session ${index + 1} must have at least one selected question.`);
            }
            if (session.score === '' || session.score === null || session.score === undefined) {
                errors.push(`Session ${index + 1} score is required.`);
            } else {
                const scoreValue = parseFloat(session.score);
                if (isNaN(scoreValue) || scoreValue < 0) {
                    errors.push(`Session ${index + 1} score must be a valid positive number.`);
                }
            }
        });
        
        return errors;
    }
    
    validateCurrentSessionScores() {
        const errors = [];
        const session = this.currentSession;
        
        if (!session) {
            errors.push('No session found.');
            return { errors, warnings: [] };
        }
        
        // 질문 점수 기본 검증
        session.selectedQuestions.forEach((question, index) => {
            if (question.score === '' || question.score === null || question.score === undefined) {
                errors.push(`Question ${index + 1} score is required.`);
            } else {
                const scoreValue = parseFloat(question.score);
                if (isNaN(scoreValue) || scoreValue < 0) {
                    errors.push(`Question ${index + 1} score must be a valid positive number.`);
                }
                
                // 선다형 질문의 선택지 점수 검증: 최대값이 질문 점수와 같아야 함
                const isMultipleChoice = question.type === 'Choosable' || question.type === 'Multi-Choosable';
                if (isMultipleChoice) {
                    const items = this.questionItems[question.id] || [];
                    if (items.length > 0) {
                        const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
                        
                        if (maxItemScore !== scoreValue) {
                            errors.push(`Question ${index + 1}: The highest item score (${maxItemScore}) must equal the question score (${scoreValue}).`);
                        }
                    }
                }
            }
        });
        
        // 질문 점수 합계가 세션 점수와 같아야 함
        const sessionScore = parseFloat(this.currentSession.score || 0);
        const questionsTotalScore = session.selectedQuestions.reduce((total, q) => {
            return total + parseFloat(q.score || 0);
        }, 0);
        
        if (Math.abs(sessionScore - questionsTotalScore) >= 0.01) {
            errors.push(`Question scores total (${questionsTotalScore}) must equal session score (${sessionScore}).`);
        }
        
        return { errors, warnings: [] };
    }
    
    validateAllSessions() {
        const errors = [];
        
        this.sessions.forEach((session, sessionIndex) => {
            // 각 세션의 질문 점수 기본 검증
            session.selectedQuestions.forEach((question, questionIndex) => {
                if (question.score === '' || question.score === null || question.score === undefined) {
                    errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1}: Score is required.`);
                } else {
                    const scoreValue = parseFloat(question.score);
                    if (isNaN(scoreValue) || scoreValue < 0) {
                        errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1}: Score must be a valid positive number.`);
                    }
                    
                    // 선다형 질문의 선택지 점수 검증: 최대값이 질문 점수와 같아야 함
                    const isMultipleChoice = question.type === 'Choosable' || question.type === 'Multi-Choosable';
                    if (isMultipleChoice && this.questionItems[question.id]) {
                        const items = this.questionItems[question.id] || [];
                        if (items.length > 0) {
                            const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
                            
                            if (maxItemScore !== scoreValue) {
                                errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1}: The highest item score (${maxItemScore}) must equal the question score (${scoreValue}).`);
                            }
                        }
                    }
                }
            });
            
            // 질문 점수 합계가 세션 점수와 같아야 함
            const sessionScore = parseFloat(session.score || 0);
            const questionsTotal = session.selectedQuestions.reduce((total, q) => total + parseFloat(q.score || 0), 0);
            
            if (Math.abs(sessionScore - questionsTotal) >= 0.01) {
                errors.push(`Session ${sessionIndex + 1}: Question scores total (${questionsTotal}) must equal session score (${sessionScore}).`);
            }
        });
        
        return { errors, warnings: [] };
    }
    
    // Save methods
    async handleSave() {
        this.log('Save initiated');
        
        const validationResult = this.validateAllSessions();
        
        // 에러가 있으면 저장 차단
        if (validationResult.errors.length > 0) {
            this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
            return;
        }

        this.isLoading = true;

        try {
            const templateData = this.buildTemplateData();
            this.log('Template data prepared', templateData);
            
            const response = await createAssessmentTemplate({ templateData: JSON.stringify(templateData) });
            const result = JSON.parse(response);
            this.log('Save result', result);
            
            if (result.success) {
                this.showToast('Success', result.message, 'success');
                this.closeModal();
            } else {
                this.showToast('Error', result.message, 'error');
            }

        } catch (error) {
            this.errorHandler(error, 'handleSave');
        } finally {
            this.isLoading = false;
        }
    }

    async handleSaveAndNew() {
        this.log('Save and New initiated');
        
        const validationResult = this.validateAllSessions();
        
        // 에러가 있으면 저장 차단
        if (validationResult.errors.length > 0) {
            this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
            return;
        }

        this.isLoading = true;

        try {
            const templateData = this.buildTemplateData();
            this.log('Template data prepared', templateData);
            
            const response = await createAssessmentTemplate({ templateData: JSON.stringify(templateData) });
            const result = JSON.parse(response);
            this.log('Save result', result);
            
            if (result.success) {
                this.showToast('Success', result.message + ' You can create a new template.', 'success');
                this.performCompleteReset();
            } else {
                this.showToast('Error', result.message, 'error');
            }

        } catch (error) {
            this.errorHandler(error, 'handleSaveAndNew');
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.log('Cancel requested');
        this.performCompleteReset();
        this._hasInitialized = false;
        this.closeModal();
    }
    
    buildTemplateData() {
        return {
            templateName: this.templateName,
            description: this.description,
            isActive: this.isActive,
            sessions: this.sessions.map(session => {
                const sessionScore = session.score && session.score !== '' ? parseFloat(session.score) : 0;
                
                return {
                    name: session.name,
                    score: sessionScore,
                    selectedQuestions: session.selectedQuestions.map((q, index) => {
                        const questionScore = parseFloat(q.score || 0);
                        
                        const questionData = {
                            id: q.id,
                            text: q.text,
                            type: q.type,
                            order: index + 1,
                            score: questionScore
                        };
                        
                        // 선다형 질문인 경우 선택지 점수 포함
                        const isMultipleChoice = q.type === 'Choosable' || q.type === 'Multi-Choosable';
                        if (isMultipleChoice && this.questionItems[q.id]) {
                            questionData.items = this.questionItems[q.id].map(item => ({
                                id: item.id,
                                name: item.name,
                                content: item.content,
                                order: item.order,
                                score: parseFloat(item.score || 0)
                            }));
                            
                            this.log('Including question items for question', { 
                                questionId: q.id, 
                                itemCount: questionData.items.length,
                                items: questionData.items
                            });
                        }
                        
                        return questionData;
                    })
                };
            })
        };
    }
    
    addInitialSession() {
        if (this.sessions.length === 0) {
            this.sessionCounter++;
            const sessionId = this.generateId();
            
            const newSession = {
                id: sessionId,
                name: 'Session 1',
                nameInputId: `sessionName_${sessionId}`,
                scoreInputId: `sessionScore_${sessionId}`,
                score: '',
                selectedQuestions: [],
                availableQuestions: [...this.availableQuestions],
                filteredAvailableQuestions: [...this.availableQuestions].map(q => ({
                    ...q,
                    cssClass: 'listbox-item'
                })),
                searchTerm: ''
            };
            
            this.sessions = [newSession];
            this.log('Initial session added');
        }
    }
    
    performCompleteReset() {
        this.log('Performing complete reset');
        
        this.currentStep = 1;
        this.currentSessionIndex = 0;
        this.templateName = '';
        this.description = '';
        this.isActive = true;
        this.sessions = [];
        this.globalSelection = { sessionId: null, listType: null, questionId: null };
        this.isLoading = false;
        this.sessionCounter = 0;
        this.questionItems = {};
        
        this.renderKey = this.renderKey + 1;
        this.addInitialSession();
    }
    
    closeModal() {
        this.log('Closing modal');
        
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
                    objectApiName: 'AssessmentTemplate__c',
                    actionName: 'home'
                }
            });
        }
    }
}