/**
 * @description Assessment Template Component with Question Score Setting - DKEDU (DK Lab Standards Applied)
 * Updated to handle sub-questions (Related Questions) logic
 * @author developer@company.com
 * @group DKEDU Components  
 * @created date 2025-01-15
 * @last modified on 2025-10-17
 * @last modified by mingyu.park@dkbmc.com
 * @version 1.4.0
 */

import { LightningElement, track, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAvailableQuestions from '@salesforce/apex/DKEDU_AssessmentTemplateController.getAvailableQuestions';
import createAssessmentTemplate from '@salesforce/apex/DKEDU_AssessmentTemplateController.createAssessmentTemplate';
import getQuestionTypes from '@salesforce/apex/DKEDU_AssessmentTemplateController.getQuestionTypes';
import getQuestionItems from '@salesforce/apex/DKEDU_AssessmentTemplateController.getQuestionItems';

const DEBUG = false;

export default class DkeduAssessmentTemplate extends NavigationMixin(LightningElement) {
    
    static DEBUG = false;
    _hasInitialized = false;
    
    @api recordId;
    @api objectApiName;
    
    // Form data properties - use private variables with getter pattern
    @track _templateName = '';
    @track _description = '';
    @track _isActive = true;
    @track _sessions = [];
    @track _renderKey = 0;
    @track _isLoading = false;
    
    // Step management
    @track _currentStep = 1; // 1: Template & Questions, 2: Question Scores
    @track _currentSessionIndex = 0;
    
    // Data from Salesforce
    @track _availableQuestions = [];
    @track _allQuestions = []; // 모든 질문 (하위질문 포함)
    @track _questionTypes = [];
    @track _questionItems = {}; // questionId를 키로 하는 선택지 맵
    
    // Global selection state
    @track _globalSelection = {
        sessionId: null,
        listType: null,
        questionId: null
    };
    
    _sessionCounter = 0;
    
    // Getters for accessing private variables
    get templateName() { return this._templateName; }
    get description() { return this._description; }
    get isActive() { return this._isActive; }
    get sessions() { return this._sessions; }
    get renderKey() { return this._renderKey; }
    get isLoading() { return this._isLoading; }
    get currentStep() { return this._currentStep; }
    get currentSessionIndex() { return this._currentSessionIndex; }
    get availableQuestions() { return this._availableQuestions; }
    get questionTypes() { return this._questionTypes; }
    get questionItems() { return this._questionItems; }
    get globalSelection() { return this._globalSelection; }
    
    // Wire methods
    @wire(getAvailableQuestions)
    wiredQuestions({ error, data }) {
        try {
            if (data) {
                // 모든 질문을 저장
                this._allQuestions = data.map(question => ({
                    id: question.Id,
                    text: question.Question__c || question.Name,
                    type: question.Type__c || 'Unknown',
                    isActive: question.IsActive__c,
                    fileIncluded: question.FileIncluded__c,
                    hasRelatedQuestion: question.HasRelatedQuestion__c,
                    relatedQuestionId: question.RelatedQuestionId__c,
                    relatedCriteria: question.RelatedCriteria__c
                }));
                
                // Available Questions에는 하위질문이 아닌 것들만 포함
                // (HasRelatedQuestion이 false이거나 RelatedQuestionId가 없는 질문들)
                this._availableQuestions = this._allQuestions.filter(question => 
                    !question.relatedQuestionId || question.relatedQuestionId === null || question.relatedQuestionId === ''
                );
                
                this.log('All questions loaded', this._allQuestions.length);
                this.log('Available questions (excluding sub-questions)', this._availableQuestions.length);
                this.updateSessionsWithNewQuestions();
            } else if (error) {
                this.errorHandler(error, 'wiredQuestions');
                this._availableQuestions = [];
                this._allQuestions = [];
            }
        } catch (e) {
            this.errorHandler(e, 'wiredQuestions');
        }
    }
    
    @wire(getQuestionTypes)
    wiredQuestionTypes({ error, data }) {
        try {
            if (data) {
                this._questionTypes = data;
                this.log('Question types loaded', this._questionTypes.length);
            } else if (error) {
                this.errorHandler(error, 'wiredQuestionTypes');
                this._questionTypes = [];
            }
        } catch (e) {
            this.errorHandler(e, 'wiredQuestionTypes');
        }
    }
    
    // Getters for template visibility
    get isStep1() {
        return this._currentStep === 1;
    }
    
    get isStep2() {
        return this._currentStep === 2;
    }
    
    get currentSession() {
        return this._sessions[this._currentSessionIndex] || null;
    }
    
    get currentSessionName() {
        return this.currentSession ? this.currentSession.name : '';
    }
    
    get currentSessionQuestions() {
        try {
            if (!this.currentSession) return [];
            
            return this.currentSession.selectedQuestions.map(q => {
                const questionItems = this._questionItems[q.id] || [];
                const isMultipleChoice = q.type === 'Choosable' || q.type === 'Multi-Choosable';
                
                return {
                    ...q,
                    isMultipleChoice: isMultipleChoice,
                    questionItems: questionItems,
                    totalItemScore: this.calculateTotalItemScore(q.id)
                };
            });
        } catch (error) {
            this.log('Error in currentSessionQuestions', error);
            return [];
        }
    }
    
    get sessionProgress() {
        return `${this._currentSessionIndex + 1} / ${this._sessions.length}`;
    }
    
    get isLastSession() {
        return this._currentSessionIndex >= this._sessions.length - 1;
    }
    
    get totalSessionScore() {
        return this.currentSession ? parseFloat(this.currentSession.score || 0) : 0;
    }
    
    get currentQuestionsTotalScore() {
        try {
            if (!this.currentSession) return 0;
            
            return this.currentSession.selectedQuestions.reduce((total, q) => {
                return total + parseFloat(q.score || 0);
            }, 0);
        } catch (error) {
            this.log('Error calculating questions total score', error);
            return 0;
        }
    }
    
    get isScoreBalanced() {
        return Math.abs(this.totalSessionScore - this.currentQuestionsTotalScore) < 0.01;
    }
    
    get isSingleSession() {
        return this._sessions.length <= 1;
    }
    
    /**
     * @description Debug logging utility
     * @param {String} message - Log message
     * @param {*} variable - Variable to log
     */
    log(message, variable) {
        if (DEBUG) {
            console.log(`[DkeduAssessmentTemplate] ${message}`, variable === undefined ? '' : 
                (typeof variable === 'object' ? JSON.stringify(variable, null, 2) : variable));
        }
    }

    /**
     * @description Error handling utility
     * @param {Error} error - Error object
     * @param {String} from - Source of error
     */
    errorHandler(error, from = 'DkeduAssessmentTemplate') {
        try {
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
    
    /**
     * @description Open modal and initialize form
     * @public
     */
    @api
    openModal() {
        try {
            this.log('Modal opened');
            this._hasInitialized = false;
            
            // Initialize to step 1
            this._currentStep = 1;
            this._currentSessionIndex = 0;
            
            // Reset form data
            this._templateName = '';
            this._description = '';
            this._isActive = true;
            this._sessions = [];
            this._globalSelection = { sessionId: null, listType: null, questionId: null };
            this._isLoading = false;
            this._sessionCounter = 0;
            this._questionItems = {};
            
            this._renderKey = this._renderKey + 1;
            this.addInitialSession();
            
            this.log('Modal opened and initialized');
        } catch (error) {
            this.errorHandler(error, 'openModal');
        }
    }
    
    connectedCallback() {
        this.log('Component connected');
    }

    renderedCallback() {
        try {
            if (!this._hasInitialized) {
                this.log('First render initialization');
                this._hasInitialized = true;
            }
            
            if (this._sessions.length === 0 && this._currentStep === 1) {
                this.log('No sessions found, adding initial session');
                this.addInitialSession();
            }
        } catch (error) {
            this.errorHandler(error, 'renderedCallback');
        }
    }

    disconnectedCallback() {
        this.log('Component disconnected');
        this._hasInitialized = false;
    }
    
    /**
     * @description Generate unique ID
     * @returns {String} Generated ID
     */
    generateId() {
        return `session_${++this._sessionCounter}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    updateSessionsWithNewQuestions() {
        try {
            if (this._sessions.length > 0 && this._availableQuestions.length > 0) {
                this._sessions.forEach(session => {
                    // 기존 선택된 질문들은 유지하고, Available Questions만 업데이트
                    session.availableQuestions = [...this._availableQuestions];
                    session.filteredAvailableQuestions = [...this._availableQuestions].map(q => ({
                        ...q,
                        cssClass: this.getQuestionCssClass(session.id, 'available', q.id)
                    }));
                });
                this.log('[DEBUG] Sessions updated without array replacement');
            } else if (this._sessions.length === 0 && this._availableQuestions.length > 0) {
                this.addInitialSession();
            }
        } catch (error) {
            this.errorHandler(error, 'updateSessionsWithNewQuestions');
        }
    }
    
    /**
     * @description 하위질문들을 찾아서 반환
     * @param {String} parentQuestionId - 부모 질문 ID
     * @returns {Array} 하위질문 배열
     */
    findSubQuestions(parentQuestionId) {
        try {
            return this._allQuestions.filter(question => 
                question.relatedQuestionId === parentQuestionId
            );
        } catch (error) {
            this.log('Error finding sub-questions', error);
            return [];
        }
    }
    
    // Event Handlers - Step 1
    handleTemplateNameChange(event) {
        try {
            this._templateName = event.target.value;
            this.log('Template name changed', this._templateName);
        } catch (error) {
            this.errorHandler(error, 'handleTemplateNameChange');
        }
    }

    handleDescriptionChange(event) {
        try {
            this._description = event.target.value;
            this.log('Description changed', this._description);
        } catch (error) {
            this.errorHandler(error, 'handleDescriptionChange');
        }
    }

    handleCheckboxChange(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const fieldName = event.target.id;
            const baseFieldName = fieldName.includes('-') ? fieldName.split('-')[0] : fieldName;
            
            const allowedFields = ['isActive'];
            
            if (allowedFields.includes(baseFieldName)) {
                this[`_${baseFieldName}`] = event.target.checked;
                this.log(`${baseFieldName} changed to ${event.target.checked} (original ID: ${fieldName})`);
            } else {
                this.log(`Unauthorized field change attempt: ${fieldName} (base: ${baseFieldName})`);
                console.warn(`[Security] Unauthorized checkbox field: ${fieldName}`);
            }
        } catch (error) {
            this.errorHandler(error, 'handleCheckboxChange');
        }
    }

    handleSessionNameChange(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const newName = event.target.value;
            
            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                session.name = newName;
                this.log('Session name changed', { sessionId, newName });
            }
        } catch (error) {
            this.errorHandler(error, 'handleSessionNameChange');
        }
    }

    handleSessionScoreChange(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const newScore = event.target.value;
            
            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                session.score = newScore;
                this.log('Session score changed', { sessionId, newScore });
            }
        } catch (error) {
            this.errorHandler(error, 'handleSessionScoreChange');
        }
    }
    
    addSession() {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            this._sessionCounter++;
            const sessionId = this.generateId();
            
            const newSession = {
                id: sessionId,
                name: `Session ${this._sessions.length + 1}`,
                nameInputId: `sessionName_${sessionId}`,
                scoreInputId: `sessionScore_${sessionId}`,
                score: '',
                selectedQuestions: [],
                availableQuestions: [...this._availableQuestions],
                filteredAvailableQuestions: [...this._availableQuestions].map(q => ({
                    ...q,
                    cssClass: 'listbox-item'
                })),
                searchTerm: ''
            };
            
            this._sessions = [...this._sessions, newSession];
            this.log('Session added', { sessionId, totalSessions: this._sessions.length });
        } catch (error) {
            this.errorHandler(error, 'addSession');
        }
    }
    
    removeSession(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const sessionId = event.currentTarget.dataset.sessionId;
            this.log('Remove session requested', sessionId);
            
            if (this._sessions.length <= 1) {
                this.showToast('Warning', 'At least one session is required.', 'warning');
                return;
            }
            
            this._sessions = this._sessions.filter(s => s.id !== sessionId);
            
            if (this._globalSelection.sessionId === sessionId) {
                this._globalSelection = { sessionId: null, listType: null, questionId: null };
            }
            
            this.showToast('Success', 'Session deleted successfully.', 'success');
            this.log('Session removed', { sessionId, remainingSessions: this._sessions.length });
        } catch (error) {
            this.errorHandler(error, 'removeSession');
        }
    }
    
    handleSearch(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const searchTerm = event.target.value.toLowerCase();
            
            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                session.searchTerm = searchTerm;
                session.filteredAvailableQuestions = session.availableQuestions
                    .filter(q => !searchTerm || q.text.toLowerCase().includes(searchTerm))
                    .map(q => ({
                        ...q,
                        cssClass: this.getQuestionCssClass(sessionId, 'available', q.id)
                    }));
                
                if (this._globalSelection.sessionId === sessionId && 
                    this._globalSelection.listType === 'available') {
                    const stillVisible = session.filteredAvailableQuestions.find(q => q.id === this._globalSelection.questionId);
                    if (!stillVisible) {
                        this._globalSelection = { sessionId: null, listType: null, questionId: null };
                    }
                }
                
                this.log('Search performed', { sessionId, searchTerm, resultsCount: session.filteredAvailableQuestions.length });
            }
        } catch (error) {
            this.errorHandler(error, 'handleSearch');
        }
    }
    
    handleListboxClick(event) {
        try {
            if (event.target.classList.contains('listbox-item')) {
                const questionId = event.target.dataset.id;
                const sessionId = event.currentTarget.dataset.sessionId;
                const listType = event.currentTarget.dataset.listType;
                
                this.clearAllSelections();
                
                this._globalSelection = {
                    sessionId: sessionId,
                    listType: listType,
                    questionId: questionId
                };
                
                this.updateSelectionDisplay();
                this.log('Question selected', this._globalSelection);
            }
        } catch (error) {
            this.errorHandler(error, 'handleListboxClick');
        }
    }
    
    clearAllSelections() {
        try {
            this._sessions = this._sessions.map(session => ({
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
        } catch (error) {
            this.errorHandler(error, 'clearAllSelections');
        }
    }
    
    updateSelectionDisplay() {
        try {
            this._sessions = this._sessions.map(session => ({
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
        } catch (error) {
            this.errorHandler(error, 'updateSelectionDisplay');
        }
    }
    
    getQuestionCssClass(sessionId, listType, questionId) {
        try {
            const isSelected = this._globalSelection.sessionId === sessionId && 
                              this._globalSelection.listType === listType && 
                              this._globalSelection.questionId === questionId;
            return isSelected ? 'listbox-item selected' : 'listbox-item';
        } catch (error) {
            this.log('Error in getQuestionCssClass', error);
            return 'listbox-item';
        }
    }
    
    moveToSelected(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const sessionId = event.currentTarget.dataset.sessionId;
            
            if (!this._globalSelection.questionId || 
                this._globalSelection.sessionId !== sessionId || 
                this._globalSelection.listType !== 'available') {
                this.showToast('Warning', 'Please select a question from Available Questions first.', 'warning');
                return;
            }

            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                const question = session.availableQuestions.find(q => q.id === this._globalSelection.questionId);
                
                if (question) {
                    // 질문과 하위질문들을 함께 추가
                    const questionsToAdd = this.getQuestionsWithSubQuestions(question);
                    
                    // 추가할 질문들을 Selected Questions에 추가
                    questionsToAdd.forEach(q => {
                        const questionWithScore = { 
                            ...q, 
                            cssClass: 'listbox-item',
                            score: '' // 질문 점수 초기화
                        };
                        session.selectedQuestions = [...session.selectedQuestions, questionWithScore];
                    });
                    
                    // Available Questions에서 추가된 질문들 제거
                    const questionIdsToRemove = questionsToAdd.map(q => q.id);
                    session.availableQuestions = session.availableQuestions.filter(q => !questionIdsToRemove.includes(q.id));
                    session.filteredAvailableQuestions = session.filteredAvailableQuestions.filter(q => !questionIdsToRemove.includes(q.id));
                    
                    this._globalSelection = { sessionId: null, listType: null, questionId: null };
                    
                    // 하위질문이 추가된 경우 메시지 표시
                    if (questionsToAdd.length > 1) {
                        this.showToast('Success', 
                            `Question moved with ${questionsToAdd.length - 1} related sub-question(s).`, 
                            'success');
                    }
                    
                    this.log('Question(s) moved to selected', { 
                        sessionId, 
                        mainQuestionId: question.id, 
                        totalQuestionsAdded: questionsToAdd.length 
                    });
                }
            }
        } catch (error) {
            this.errorHandler(error, 'moveToSelected');
        }
    }
    
    /**
     * @description 질문과 그에 따른 하위질문들을 함께 반환
     * @param {Object} mainQuestion - 메인 질문 객체
     * @returns {Array} 메인 질문과 하위질문들의 배열
     */
    getQuestionsWithSubQuestions(mainQuestion) {
        try {
            const questionsToAdd = [mainQuestion];
            
            // 메인 질문이 HasRelatedQuestion이 true인 경우 하위질문들 찾기
            if (mainQuestion.hasRelatedQuestion) {
                const subQuestions = this.findSubQuestions(mainQuestion.id);
                
                // 하위질문들을 메인 질문 바로 뒤에 추가
                if (subQuestions.length > 0) {
                    questionsToAdd.push(...subQuestions);
                    this.log('Sub-questions found for main question', {
                        mainQuestionId: mainQuestion.id,
                        subQuestionsCount: subQuestions.length
                    });
                }
            }
            
            return questionsToAdd;
        } catch (error) {
            this.log('Error getting questions with sub-questions', error);
            return [mainQuestion];
        }
    }

    moveToAvailable(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const sessionId = event.currentTarget.dataset.sessionId;
            
            if (!this._globalSelection.questionId || 
                this._globalSelection.sessionId !== sessionId || 
                this._globalSelection.listType !== 'selected') {
                this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
                return;
            }

            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                const question = session.selectedQuestions.find(q => q.id === this._globalSelection.questionId);
                
                if (question) {
                    // 하위질문인지 확인
                    const isSubQuestion = question.relatedQuestionId && question.relatedQuestionId !== '';
                    
                    if (isSubQuestion) {
                        // 하위질문은 개별적으로 제거하지 않고 부모 질문과 함께만 제거되어야 함
                        this.showToast('Warning', 
                            'Sub-questions cannot be removed individually. Please remove the parent question instead.', 
                            'warning');
                        return;
                    }
                    
                    // 메인 질문 제거 시 관련된 하위질문들도 함께 제거
                    const questionsToRemove = this.getQuestionsToRemove(question, session.selectedQuestions);
                    
                    // Available Questions에 다시 추가 (하위질문이 아닌 것들만)
                    questionsToRemove.forEach(q => {
                        // 하위질문이 아닌 경우에만 Available Questions에 추가
                        if (!q.relatedQuestionId || q.relatedQuestionId === '') {
                            session.availableQuestions = [...session.availableQuestions, { ...q, cssClass: 'listbox-item' }];
                        }
                    });
                    
                    // Selected Questions에서 제거
                    const questionIdsToRemove = questionsToRemove.map(q => q.id);
                    session.selectedQuestions = session.selectedQuestions.filter(q => !questionIdsToRemove.includes(q.id));
                    
                    // Filtered Available Questions 업데이트
                    const searchTerm = session.searchTerm;
                    session.filteredAvailableQuestions = session.availableQuestions
                        .filter(q => !searchTerm || q.text.toLowerCase().includes(searchTerm))
                        .map(q => ({ ...q, cssClass: 'listbox-item' }));
                    
                    this._globalSelection = { sessionId: null, listType: null, questionId: null };
                    
                    // 하위질문이 함께 제거된 경우 메시지 표시
                    if (questionsToRemove.length > 1) {
                        this.showToast('Success', 
                            `Question removed with ${questionsToRemove.length - 1} related sub-question(s).`, 
                            'success');
                    }
                    
                    this.log('Question(s) moved to available', { 
                        sessionId, 
                        mainQuestionId: question.id,
                        totalQuestionsRemoved: questionsToRemove.length
                    });
                }
            }
        } catch (error) {
            this.errorHandler(error, 'moveToAvailable');
        }
    }
    
    /**
     * @description 제거할 질문들 (메인 질문과 그 하위질문들) 반환
     * @param {Object} mainQuestion - 제거할 메인 질문
     * @param {Array} selectedQuestions - 현재 선택된 질문들 배열
     * @returns {Array} 제거할 질문들의 배열
     */
    getQuestionsToRemove(mainQuestion, selectedQuestions) {
        try {
            const questionsToRemove = [mainQuestion];
            
            // 메인 질문에 연결된 하위질문들 찾기
            if (mainQuestion.hasRelatedQuestion) {
                const subQuestions = selectedQuestions.filter(q => 
                    q.relatedQuestionId === mainQuestion.id
                );
                
                if (subQuestions.length > 0) {
                    questionsToRemove.push(...subQuestions);
                    this.log('Sub-questions found for removal', {
                        mainQuestionId: mainQuestion.id,
                        subQuestionsCount: subQuestions.length
                    });
                }
            }
            
            return questionsToRemove;
        } catch (error) {
            this.log('Error getting questions to remove', error);
            return [mainQuestion];
        }
    }

    moveUp(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const sessionId = event.currentTarget.dataset.sessionId;
            
            if (!this._globalSelection.questionId || 
                this._globalSelection.sessionId !== sessionId || 
                this._globalSelection.listType !== 'selected') {
                this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
                return;
            }

            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                const currentIndex = session.selectedQuestions.findIndex(q => q.id === this._globalSelection.questionId);
                
                if (currentIndex > 0) {
                    const currentQuestion = session.selectedQuestions[currentIndex];
                    
                    // 하위질문인 경우 개별 이동 제한
                    if (currentQuestion.relatedQuestionId && currentQuestion.relatedQuestionId !== '') {
                        this.showToast('Warning', 
                            'Sub-questions cannot be moved individually. Please move the parent question instead.', 
                            'warning');
                        return;
                    }
                    
                    // 메인 질문과 하위질문들을 그룹으로 이동
                    const questionsToMove = this.getQuestionsToMove(currentQuestion, session.selectedQuestions);
                    const moveGroupSize = questionsToMove.length;
                    
                    // 이동할 수 있는지 확인 (그룹 전체가 이동 가능한지)
                    if (currentIndex >= moveGroupSize) {
                        const updatedQuestions = [...session.selectedQuestions];
                        
                        // 그룹을 위로 이동
                        for (let i = 0; i < moveGroupSize; i++) {
                            [updatedQuestions[currentIndex - moveGroupSize + i], updatedQuestions[currentIndex + i]] = 
                            [updatedQuestions[currentIndex + i], updatedQuestions[currentIndex - moveGroupSize + i]];
                        }
                        
                        session.selectedQuestions = updatedQuestions.map(q => ({
                            ...q,
                            cssClass: this.getQuestionCssClass(sessionId, 'selected', q.id)
                        }));
                        
                        this.log('Question group moved up', { 
                            sessionId, 
                            questionId: this._globalSelection.questionId,
                            groupSize: moveGroupSize
                        });
                    }
                }
            }
        } catch (error) {
            this.errorHandler(error, 'moveUp');
        }
    }

    moveDown(event) {
        try {
            event.preventDefault();
            event.stopPropagation();
            
            const sessionId = event.currentTarget.dataset.sessionId;
            
            if (!this._globalSelection.questionId || 
                this._globalSelection.sessionId !== sessionId || 
                this._globalSelection.listType !== 'selected') {
                this.showToast('Warning', 'Please select a question from Selected Questions first.', 'warning');
                return;
            }

            const session = this._sessions.find(s => s.id === sessionId);
            if (session) {
                const currentIndex = session.selectedQuestions.findIndex(q => q.id === this._globalSelection.questionId);
                
                if (currentIndex < session.selectedQuestions.length - 1) {
                    const currentQuestion = session.selectedQuestions[currentIndex];
                    
                    // 하위질문인 경우 개별 이동 제한
                    if (currentQuestion.relatedQuestionId && currentQuestion.relatedQuestionId !== '') {
                        this.showToast('Warning', 
                            'Sub-questions cannot be moved individually. Please move the parent question instead.', 
                            'warning');
                        return;
                    }
                    
                    // 메인 질문과 하위질문들을 그룹으로 이동
                    const questionsToMove = this.getQuestionsToMove(currentQuestion, session.selectedQuestions);
                    const moveGroupSize = questionsToMove.length;
                    
                    // 이동할 수 있는지 확인 (그룹 전체가 이동 가능한지)
                    if (currentIndex + moveGroupSize < session.selectedQuestions.length) {
                        const updatedQuestions = [...session.selectedQuestions];
                        
                        // 그룹을 아래로 이동
                        for (let i = moveGroupSize - 1; i >= 0; i--) {
                            [updatedQuestions[currentIndex + i], updatedQuestions[currentIndex + moveGroupSize + i]] = 
                            [updatedQuestions[currentIndex + moveGroupSize + i], updatedQuestions[currentIndex + i]];
                        }
                        
                        session.selectedQuestions = updatedQuestions.map(q => ({
                            ...q,
                            cssClass: this.getQuestionCssClass(sessionId, 'selected', q.id)
                        }));
                        
                        this.log('Question group moved down', { 
                            sessionId, 
                            questionId: this._globalSelection.questionId,
                            groupSize: moveGroupSize
                        });
                    }
                }
            }
        } catch (error) {
            this.errorHandler(error, 'moveDown');
        }
    }
    
    /**
     * @description 이동할 질문 그룹 (메인 질문과 연속된 하위질문들) 반환
     * @param {Object} mainQuestion - 메인 질문
     * @param {Array} selectedQuestions - 선택된 질문들 배열
     * @returns {Array} 이동할 질문 그룹
     */
    getQuestionsToMove(mainQuestion, selectedQuestions) {
        try {
            const questionsToMove = [mainQuestion];
            const mainIndex = selectedQuestions.findIndex(q => q.id === mainQuestion.id);
            
            // 메인 질문 다음에 연속된 하위질문들 찾기
            if (mainQuestion.hasRelatedQuestion) {
                for (let i = mainIndex + 1; i < selectedQuestions.length; i++) {
                    const nextQuestion = selectedQuestions[i];
                    if (nextQuestion.relatedQuestionId === mainQuestion.id) {
                        questionsToMove.push(nextQuestion);
                    } else {
                        break; // 연속되지 않으면 중단
                    }
                }
            }
            
            return questionsToMove;
        } catch (error) {
            this.log('Error getting questions to move', error);
            return [mainQuestion];
        }
    }
    
    // Step 2 Event Handlers
    handleQuestionScoreChange(event) {
        try {
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
        } catch (error) {
            this.errorHandler(error, 'handleQuestionScoreChange');
        }
    }
    
    handleQuestionItemScoreChange(event) {
        try {
            const questionId = event.target.dataset.questionId;
            const itemId = event.target.dataset.itemId;
            const newScore = event.target.value;
            
            if (!this._questionItems[questionId]) {
                this._questionItems[questionId] = [];
            }
            
            // 해당 선택지 찾아서 점수 업데이트
            const item = this._questionItems[questionId].find(item => item.id === itemId);
            if (item) {
                item.score = newScore;
                this.log('Question item score changed', { questionId, itemId, newScore });
                
                // 실시간 검증: 선택지 점수가 질문 점수를 초과하는지 확인
                this.validateQuestionItemScoresRealtime(questionId);
            }
            
            // UI 강제 업데이트를 위해 currentSessionQuestions getter 재계산 트리거
            this._renderKey = this._renderKey + 1;
        } catch (error) {
            this.errorHandler(error, 'handleQuestionItemScoreChange');
        }
    }
    
    validateQuestionItemScoresRealtime(questionId) {
        try {
            const session = this.currentSession;
            if (!session) return;
            
            const question = session.selectedQuestions.find(q => q.id === questionId);
            const questionScore = parseFloat(question?.score || 0);
            const items = this._questionItems[questionId] || [];
            
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
        } catch (error) {
            this.errorHandler(error, 'validateQuestionItemScoresRealtime');
        }
    }
    
    calculateTotalItemScore(questionId) {
        try {
            if (!this._questionItems[questionId]) return 0;
            
            return this._questionItems[questionId].reduce((total, item) => {
                return total + parseFloat(item.score || 0);
            }, 0);
        } catch (error) {
            this.log('Error calculating total item score', error);
            return 0;
        }
    }
    
    // Navigation methods
    async handleNext() {
        try {
            this.log('Next button clicked');
            
            const validationErrors = this.validateStep1();
            if (validationErrors.length > 0) {
                this.showToast('Validation Error', validationErrors.join(' '), 'error');
                return;
            }
            
            // Load question items for multiple choice questions
            await this.loadQuestionItems();
            
            // Move to step 2
            this._currentStep = 2;
            this._currentSessionIndex = 0;
            
            this.log('Moved to step 2 - Question Scores');
        } catch (error) {
            this.errorHandler(error, 'handleNext');
        }
    }
    
    handlePrevious() {
        try {
            if (this._currentStep === 2) {
                this._currentStep = 1;
                this.log('Moved back to step 1');
            }
        } catch (error) {
            this.errorHandler(error, 'handlePrevious');
        }
    }
    
    handlePreviousSession() {
        try {
            if (this._currentSessionIndex > 0) {
                this._currentSessionIndex--;
                this.log('Moved to previous session', this._currentSessionIndex);
            }
        } catch (error) {
            this.errorHandler(error, 'handlePreviousSession');
        }
    }
    
    handleNextSession() {
        try {
            const validationResult = this.validateCurrentSessionScores();
            
            // 에러가 있으면 진행 차단
            if (validationResult.errors.length > 0) {
                this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                return;
            }
            
            if (this._currentSessionIndex < this._sessions.length - 1) {
                this._currentSessionIndex++;
                this.log('Moved to next session', this._currentSessionIndex);
            }
        } catch (error) {
            this.errorHandler(error, 'handleNextSession');
        }
    }
    
    async loadQuestionItems() {
        try {
            // 선다형 질문들의 선택지를 로드
            const multipleChoiceQuestions = [];
            
            this._sessions.forEach(session => {
                session.selectedQuestions.forEach(question => {
                    if (question.type === 'Choosable' || question.type === 'Multi-Choosable') {
                        multipleChoiceQuestions.push(question.id);
                    }
                });
            });
            
            if (multipleChoiceQuestions.length > 0) {
                const result = await getQuestionItems({ questionIds: multipleChoiceQuestions });
                
                // 질문ID별로 선택지들을 그룹화
                this._questionItems = {}; // 초기화
                
                result.forEach(item => {
                    if (!this._questionItems[item.AssessmentQuestion__c]) {
                        this._questionItems[item.AssessmentQuestion__c] = [];
                    }
                    
                    this._questionItems[item.AssessmentQuestion__c].push({
                        id: item.Id,
                        name: item.Name,
                        content: item.Content__c,
                        order: item.Order__c,
                        score: '' // 초기 점수는 빈 값
                    });
                });
                
                // 선택지들을 Order 순으로 정렬
                Object.keys(this._questionItems).forEach(questionId => {
                    this._questionItems[questionId].sort((a, b) => a.order - b.order);
                });
                
                this.log('Question items loaded and sorted', this._questionItems);
            }
        } catch (error) {
            this.errorHandler(error, 'loadQuestionItems');
        }
    }
    
    // Validation methods
    validateStep1() {
        try {
            const errors = [];
            
            if (!this._templateName.trim()) {
                errors.push('Template Name is required.');
            }
            
            if (this._sessions.length === 0) {
                errors.push('At least one session is required.');
            }
            
            this._sessions.forEach((session, index) => {
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
        } catch (error) {
            this.errorHandler(error, 'validateStep1');
            return ['Validation error occurred'];
        }
    }
    
    validateCurrentSessionScores() {
        try {
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
                        const items = this._questionItems[question.id] || [];
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
        } catch (error) {
            this.errorHandler(error, 'validateCurrentSessionScores');
            return { errors: ['Validation error occurred'], warnings: [] };
        }
    }
    
    validateAllSessions() {
        try {
            const errors = [];
            
            this._sessions.forEach((session, sessionIndex) => {
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
                        if (isMultipleChoice && this._questionItems[question.id]) {
                            const items = this._questionItems[question.id] || [];
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
        } catch (error) {
            this.errorHandler(error, 'validateAllSessions');
            return { errors: ['Validation error occurred'], warnings: [] };
        }
    }
    
    // Save methods
    async handleSave() {
        this.log('Save initiated');
        
        try {
            const validationResult = this.validateAllSessions();
            
            // 에러가 있으면 저장 차단
            if (validationResult.errors.length > 0) {
                this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                return;
            }

            this._isLoading = true;

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
            this._isLoading = false;
        }
    }

    async handleSaveAndNew() {
        this.log('Save and New initiated');
        
        try {
            const validationResult = this.validateAllSessions();
            
            // 에러가 있으면 저장 차단
            if (validationResult.errors.length > 0) {
                this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                return;
            }

            this._isLoading = true;

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
            this._isLoading = false;
        }
    }

    handleCancel() {
        try {
            this.log('Cancel requested');
            this.performCompleteReset();
            this._hasInitialized = false;
            this.closeModal();
        } catch (error) {
            this.errorHandler(error, 'handleCancel');
        }
    }
    
    buildTemplateData() {
        try {
            return {
                templateName: this._templateName,
                description: this._description,
                isActive: this._isActive,
                sessions: this._sessions.map(session => {
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
                            if (isMultipleChoice && this._questionItems[q.id]) {
                                questionData.items = this._questionItems[q.id].map(item => ({
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
        } catch (error) {
            this.errorHandler(error, 'buildTemplateData');
            return {};
        }
    }
    
    addInitialSession() {
        try {
            if (this._sessions.length === 0) {
                this._sessionCounter++;
                const sessionId = this.generateId();
                
                const newSession = {
                    id: sessionId,
                    name: 'Session 1',
                    nameInputId: `sessionName_${sessionId}`,
                    scoreInputId: `sessionScore_${sessionId}`,
                    score: '',
                    selectedQuestions: [],
                    availableQuestions: [...this._availableQuestions],
                    filteredAvailableQuestions: [...this._availableQuestions].map(q => ({
                        ...q,
                        cssClass: 'listbox-item'
                    })),
                    searchTerm: ''
                };
                
                this._sessions = [newSession];
                this.log('Initial session added');
            }
        } catch (error) {
            this.errorHandler(error, 'addInitialSession');
        }
    }
    
    performCompleteReset() {
        try {
            this.log('Performing complete reset');
            
            this._currentStep = 1;
            this._currentSessionIndex = 0;
            this._templateName = '';
            this._description = '';
            this._isActive = true;
            this._sessions = [];
            this._globalSelection = { sessionId: null, listType: null, questionId: null };
            this._isLoading = false;
            this._sessionCounter = 0;
            this._questionItems = {};
            
            this._renderKey = this._renderKey + 1;
            this.addInitialSession();
        } catch (error) {
            this.errorHandler(error, 'performCompleteReset');
        }
    }
    
    closeModal() {
        try {
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
        } catch (error) {
            this.errorHandler(error, 'closeModal');
        }
    }
}