/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-13
 * @last modified by  : mingyu.park@dkbmc.com
**/
import { api, track } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex Methods
import createAssessmentTemplate from '@salesforce/apex/DKEDU_AssessmentTemplateController.createAssessmentTemplate';
import getAvailableQuestions from '@salesforce/apex/DKEDU_AssessmentTemplateController.getAvailableQuestions';
import getChildQuestions from '@salesforce/apex/DKEDU_AssessmentTemplateController.getChildQuestions';
import getQuestionItems from '@salesforce/apex/DKEDU_AssessmentTemplateController.getQuestionItems';

const DEBUG = true;

export default class DkeduAssessmentTemplateModal extends LightningModal {
    @api parentRecordId;
    
    @track templateName = '';
    @track description = '';
    @track isActive = true;
    @track sessions = [];
    @track isLoading = false;
    @track currentStep = 1; // 1: Template & Questions, 2: Question Scores
    @track currentSessionIndex = 0;
    @track availableQuestions = [];
    @track questionItems = {};
    
    questionDetailsMap = new Map();
    parentChildMap = new Map();
    childParentMap = new Map();
    
    // Computed Properties with Error Handling
    get isStep1() {
        try {
            return this.currentStep === 1;
        } catch (error) {
            this.handleError(error, 'isStep1');
            return true; // Default to step 1
        }
    }

    get isStep2() {
        try {
            return this.currentStep === 2;
        } catch (error) {
            this.handleError(error, 'isStep2');
            return false; // Default to not step 2
        }
    }

    get modalHeaderLabel() {
        try {
            if (this.currentStep === 1) {
                return 'New Assessment Template';
            } else if (this.currentStep === 2) {
                return `Set Question Scores - ${this.currentSessionName}`;
            }
            return 'Assessment Template';
        } catch (error) {
            this.handleError(error, 'modalHeaderLabel');
            return 'Assessment Template'; // Default fallback
        }
    }

    get currentSessionName() {
        try {
            return this.currentSession ? this.currentSession.name : '';
        } catch (error) {
            this.handleError(error, 'currentSessionName');
            return '';
        }
    }

    get currentSession() {
        try {
            return this.sessions[this.currentSessionIndex] || null;
        } catch (error) {
            this.handleError(error, 'currentSession');
            return null;
        }
    }

    get currentSessionQuestions() {
        try {
            if (!this.currentSession) return [];
            
            // Convert selectedQuestionValues (IDs) to question objects with scores
            return this.currentSession.selectedQuestionValues.map(questionId => {
                const score = this.currentSession.questionScores?.[questionId] || 0;
                
                // Get question details from map
                const questionDetails = this.questionDetailsMap.get(questionId);
                const text = questionDetails ? questionDetails.name : questionId;
                const type = questionDetails ? questionDetails.type : 'Unknown';
                
                // Check if this is a child question
                const isChildQuestion = this.childParentMap.has(questionId);
                
                // Build class name
                const className = isChildQuestion 
                    ? 'question-score-row slds-box slds-m-bottom_small child-question'
                    : 'question-score-row slds-box slds-m-bottom_small';
                
                // Check if multiple choice
                const isMultipleChoice = type === 'Choosable' || type === 'Multi-Choosable';
                
                // Get question items if multiple choice
                const items = this.questionItems[questionId] || [];
                
                return {
                    id: questionId,
                    text: text,
                    type: type,
                    score: score,
                    isMultipleChoice: isMultipleChoice,
                    questionItems: items,
                    isChildQuestion: isChildQuestion,
                    className: className
                };
            });
        } catch (error) {
            this.handleError(error, 'currentSessionQuestions');
            return [];
        }
    }

    get sessionProgress() {
        try {
            return `${this.currentSessionIndex + 1} / ${this.sessions.length}`;
        } catch (error) {
            this.handleError(error, 'sessionProgress');
            return '1 / 1';
        }
    }

    get isFirstSession() {
        try {
            return this.currentSessionIndex === 0;
        } catch (error) {
            this.handleError(error, 'isFirstSession');
            return true;
        }
    }

    get isLastSession() {
        try {
            return this.currentSessionIndex >= this.sessions.length - 1;
        } catch (error) {
            this.handleError(error, 'isLastSession');
            return true;
        }
    }

    get isSingleSession() {
        try {
            return this.sessions.length <= 1;
        } catch (error) {
            this.handleError(error, 'isSingleSession');
            return true;
        }
    }

    get isNextDisabled() {
        try {
            return this.isLoading || !this.templateName.trim() || this.sessions.length === 0;
        } catch (error) {
            this.handleError(error, 'isNextDisabled');
            return true; // Default to disabled for safety
        }
    }

    // Lifecycle
    async connectedCallback() {
        try {
            this.debugLog('🔄 Assessment Template Modal Connected');
            await this.loadAvailableQuestions();
            this.initializeDefaultSession();
        } catch (error) {
            this.handleError(error, 'connectedCallback');
        }
    }
    
    // Load questions from Salesforce
    async loadAvailableQuestions() {
        try {
            this.debugLog('Loading questions from Salesforce...');
            const questions = await getAvailableQuestions();
            
            // Store question details in map for quick lookup
            this.questionDetailsMap = new Map();
            questions.forEach(q => {
                this.questionDetailsMap.set(q.Id, {
                    id: q.Id,
                    name: q.Question__c || q.Name,
                    type: q.Type__c || 'Unknown'
                });
            });
            
            // Format for lightning-dual-listbox: {label, value}
            this.availableQuestions = questions.map(q => ({
                label: `${q.Question__c || q.Name} (${q.Type__c || 'Unknown'})`,
                value: q.Id
            }));
            this.debugLog('Questions loaded:', this.availableQuestions.length);
        } catch (error) {
            this.debugLog('Error loading questions:', error);
            this.showToast('Error', 'Failed to load questions: ' + (error.body?.message || error.message), 'error');
            // Use empty array if loading fails
            this.availableQuestions = [];
        }
    }
    
    // Initialization - Always start with 1 session
    initializeDefaultSession() {
        try {
            if (this.sessions.length === 0) {
                this.addSession();
                this.debugLog('Default session created');
            }
        } catch (error) {
            this.handleError(error, 'initializeDefaultSession');
        }
    }

    // Event Handlers - Basic Form Fields
    handleTemplateNameChange(event) {
        try {
            this.templateName = event.target.value;
            this.debugLog('Template Name:', this.templateName);
        } catch (error) {
            this.handleError(error, 'handleTemplateNameChange');
        }
    }

    handleDescriptionChange(event) {
        try {
            this.description = event.target.value;
            this.debugLog('Description:', this.description);
        } catch (error) {
            this.handleError(error, 'handleDescriptionChange');
        }
    }

    handleIsActiveChange(event) {
        try {
            this.isActive = event.target.checked;
            this.debugLog('Is Active:', this.isActive);
        } catch (error) {
            this.handleError(error, 'handleIsActiveChange');
        }
    }

    // Session Management
    addSession() {
        try {
            const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const newSession = {
                id: sessionId,
                name: `Session ${this.sessions.length + 1}`,
                score: 0,
                availableQuestionOptions: [...this.availableQuestions], // For lightning-dual-listbox
                selectedQuestionValues: [], // For lightning-dual-listbox
                questionScores: {}, // Map questionId -> score
                searchTerm: '' // For filtering questions
            };
            
            this.sessions = [...this.sessions, newSession];
            this.debugLog('Added new session:', newSession);
        } catch (error) {
            this.handleError(error, 'addSession');
        }
    }

    debugDualListboxState(sessionId, step, additionalData = {}) {
        try {
            const session = this.sessions.find(s => s.id === sessionId);
            if (!session) return;
        } catch (error) {
            console.error('Error in debugDualListboxState:', error);
        }
    }

    // 2. handleDualListboxChange에 강화된 디버깅 추가
    async handleDualListboxChange(event) {
        const sessionId = event.target.dataset.sessionId;
        let selectedValues = event.detail.value;
        
        // 초기 상태 디버깅
        this.debugDualListboxState(sessionId, 'INITIAL', {
            originalSelectedValues: selectedValues
        });
        
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }
    
        if (this.isLoading) {
            event.preventDefault();
            return;
        }
        
        this.isLoading = true;
        
        try {
            const previousValues = session.selectedQuestionValues || [];
            
            // 만약 값이 같다면 조기 종료 (무한루프 방지)
            if (JSON.stringify(previousValues) === JSON.stringify(selectedValues)) {
                this.isLoading = false;
                return;
            }
            
            // 부모와 자식 분리
            const currentParentsInOrder = selectedValues.filter(id => !this.childParentMap.has(id));
            const previousParentsInOrder = previousValues.filter(id => !this.childParentMap.has(id));
            
            this.debugDualListboxState(sessionId, 'PARENT_EXTRACTION', {
                currentParentsInOrder,
                previousParentsInOrder
            });
            
            // 변화 유형 분석
            const isOrderChange = this.arraysEqual(
                [...currentParentsInOrder].sort(), 
                [...previousParentsInOrder].sort()
            ) && !this.arraysEqual(currentParentsInOrder, previousParentsInOrder);
            
            const newlyAdded = currentParentsInOrder.filter(v => !previousParentsInOrder.includes(v));
            const removed = previousParentsInOrder.filter(v => !currentParentsInOrder.includes(v));
                        
            // 자식 질문 로딩이 필요한 부모들
            const parentsNeedingChildren = newlyAdded.filter(parentId => 
                !this.parentChildMap.has(parentId)
            );
            
            this.debugDualListboxState(sessionId, 'NEED_CHILDREN', {
                parentsNeedingChildren
            });
            
            // 자식 질문 로딩
            for (const parentId of parentsNeedingChildren) {
                try {
                    const childQuestions = await getChildQuestions({ parentQuestionId: parentId });
                    
                    if (childQuestions && childQuestions.length > 0) {
                        const childIds = childQuestions.map(q => q.Id);
                        this.parentChildMap.set(parentId, childIds);
                        childIds.forEach(childId => {
                            this.childParentMap.set(childId, parentId);
                        });
                        
                        // 질문 세부정보 저장
                        childQuestions.forEach(q => {
                            this.questionDetailsMap.set(q.Id, {
                                id: q.Id,
                                name: q.Question__c || q.Name,
                                type: q.Type__c || 'Unknown'
                            });
                        });
                        
                    } else {
                        this.parentChildMap.set(parentId, []);                     
                    }
                } catch (error) {
                    this.parentChildMap.set(parentId, []);
                }
            }
            
            this.debugDualListboxState(sessionId, 'AFTER_LOADING', {});
            
            // 제거된 부모들 정리
            for (const removedId of removed) {
                if (this.parentChildMap.has(removedId)) {
                    const childIds = this.parentChildMap.get(removedId);

                    childIds.forEach(childId => this.childParentMap.delete(childId));
                    this.parentChildMap.delete(removedId);
                }
            }
            
            // 최종 순서 구성
            let finalSelectedValues;
            
            if (isOrderChange) {
                finalSelectedValues = this.buildOrderRespectingUserChoice(currentParentsInOrder, previousValues);
            } else {
                finalSelectedValues = this.buildOrderWithAutoPlacement(currentParentsInOrder);
            }
            
            this.debugDualListboxState(sessionId, 'FINAL_ORDER_BUILT', {
                finalSelectedValues
            });
            // 세션 업데이트
            const updatedSessions = [...this.sessions.map(s => {
                if (s.id === sessionId) {
                    return {
                        ...s,
                        selectedQuestionValues: [...finalSelectedValues],
                        _lastUpdated: Date.now()
                    };
                }
                return s;
            })];
            
            this.sessions = updatedSessions;
            
            this.debugDualListboxState(sessionId, 'AFTER_UPDATE', {});
            
        } catch (error) {
            console.error('💥 Critical error in handleDualListboxChange:', error);
        } finally {
            this.isLoading = false;
        }
    }

    // 3. 순서 구성 메소드들에도 디버깅 추가
    buildOrderRespectingUserChoice(currentParentsInOrder, previousValues) {
        try {
            
            const result = [];
            const existingChildren = previousValues.filter(id => this.childParentMap.has(id));
            
            for (const parentId of currentParentsInOrder) {
                result.push(parentId);
                
                if (this.parentChildMap.has(parentId)) {
                    const children = this.parentChildMap.get(parentId);
                    const existingChildrenOfThisParent = children.filter(childId => 
                        existingChildren.includes(childId)
                    );
                    result.push(...existingChildrenOfThisParent);
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error in buildOrderRespectingUserChoice:', error);
            return currentParentsInOrder;
        }
    }

    buildOrderWithAutoPlacement(currentParentsInOrder) {
        try {
            const result = [];
            
            for (const parentId of currentParentsInOrder) {
                result.push(parentId);
                
                if (this.parentChildMap.has(parentId)) {
                    const children = this.parentChildMap.get(parentId);
                    result.push(...children);
                    
                    console.log(`  Parent ${parentId} → children:`, children);
                }
            }
            
            console.log('🆕 buildOrderWithAutoPlacement OUTPUT:', result);
            return result;
        } catch (error) {
            console.error('Error in buildOrderWithAutoPlacement:', error);
            return currentParentsInOrder;
        }
    }

    arraysEqual(arr1, arr2) {
        try {
            const result = arr1.length === arr2.length && arr1.every((val, index) => val === arr2[index]);
            return result;
        } catch (error) {
            console.error('Error in arraysEqual:', error);
            return false;
        }
    }

    handleDebugSession() {
        try {
            this.sessions.forEach((session, index) => {
                this.debugDualListboxState(session.id, `MANUAL_${index}`, {});
            });
        } catch (error) {
            console.error('Error in handleDebugSession:', error);
        }
    }

    // Dual-listbox 강제 리렌더링 테스트
    async handleForceRefresh(sessionId) {
        try {
            console.log('🔄 FORCE REFRESH TEST');
            
            // 현재 세션 복사
            const session = this.sessions.find(s => s.id === sessionId);
            if (!session) return;
            
            const currentValues = [...session.selectedQuestionValues];
            
            // 1. 빈 값으로 설정
            this.sessions = this.sessions.map(s => {
                if (s.id === sessionId) {
                    return { ...s, selectedQuestionValues: [] };
                }
                return s;
            });
            
            // 2. 잠깐 기다리기
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 3. 원래 값으로 복구
            this.sessions = this.sessions.map(s => {
                if (s.id === sessionId) {
                    return { ...s, selectedQuestionValues: currentValues };
                }
                return s;
            });
            
            console.log('🔄 Force refresh completed');
        } catch (error) {
            console.error('Error in handleForceRefresh:', error);
        }
    }

    removeSession(event) {
        try {
            event.preventDefault();

            const sessionId = event.target.dataset.sessionId;

            // Prevent removing the last session - minimum 1 session required
                if (this.sessions.length <= 1) {
                    this.showToast('Warning', 'At least one session is required', 'warning');
                    return;
                }

                this.sessions = this.sessions.filter(session => session.id !== sessionId);
                
                // Adjust current session index if needed
                if (this.currentSessionIndex >= this.sessions.length) {
                    this.currentSessionIndex = Math.max(0, this.sessions.length - 1);
                }
                
                this.debugLog('Removed session:', sessionId);
            } catch (error) {
                this.handleError(error, 'removeSession');
            }
    }

    handleSessionNameChange(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const newName = event.target.value;
            
            this.sessions = this.sessions.map(session => 
                session.id === sessionId ? { ...session, name: newName } : session
            );
            
            this.debugLog('Session name changed:', sessionId, newName);
        } catch (error) {
            this.handleError(error, 'handleSessionNameChange');
        }
    }

    handleSessionScoreChange(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const newScore = parseFloat(event.target.value) || 0;   
            
            this.sessions = this.sessions.map(session => 
                session.id === sessionId ? { ...session, score: newScore } : session
            );
            
            this.debugLog('Session score changed:', sessionId, newScore);
        } catch (error) {
            this.handleError(error, 'handleSessionScoreChange');
        }
    }

    // Step Navigation
    async handleNext() {
        try {
            if (this.isLoading) {
                return; // ✅ 추가 필요 - 로딩 중 중복 실행 방지
            }

            if (this.currentStep === 1) {
                // Validate Step 1
                const errors = this.validateStep1();
                if (errors.length > 0) {
                    this.showToast('Validation Error', errors.join(' '), 'error');
                    return;
                }
                
                // Load question items for multiple choice questions
                await this.loadQuestionItems();
                
                this.currentStep = 2;
                this.debugLog('Moved to step 2');
            }
        } catch (error) {
            this.handleError(error, 'handleNext');
        }
    }

    handlePrevious() {
        try {
            if (this.currentStep === 2) {
                this.currentStep = 1;
                this.debugLog('Moved to step 1');
            }
        } catch (error) {
            this.handleError(error, 'handlePrevious');
        }
    }

    // Question Search Handler
    handleQuestionSearch(event) {
        try {
            const sessionId = event.target.dataset.sessionId;
            const searchTerm = event.target.value.toLowerCase();
            
            const session = this.sessions.find(s => s.id === sessionId);
            if (!session) return;
            
            // Filter available questions based on search term
            if (searchTerm) {
                const filteredOptions = this.availableQuestions.filter(question => 
                    question.label.toLowerCase().includes(searchTerm)
                );
                
                // Update session with filtered options
                this.sessions = this.sessions.map(s => {
                    if (s.id === sessionId) {
                        return {
                            ...s,
                            availableQuestionOptions: filteredOptions,
                            searchTerm: searchTerm
                        };
                    }
                    return s;
                });
            } else {
                // Reset to all questions if search is cleared
                this.sessions = this.sessions.map(s => {
                    if (s.id === sessionId) {
                        return {
                            ...s,
                            availableQuestionOptions: [...this.availableQuestions],
                            searchTerm: ''
                        };
                    }
                    return s;
                });
            }
            
            this.debugLog('Question search:', searchTerm, 'Results:', 
                this.sessions.find(s => s.id === sessionId).availableQuestionOptions.length);
        } catch (error) {
            this.handleError(error, 'handleQuestionSearch');
        }
    }

    handlePreviousSession() {
        try {
            if (this.currentSessionIndex > 0) {
                this.currentSessionIndex--;
                this.debugLog('Previous session:', this.currentSessionIndex);
            }
        } catch (error) {
            this.handleError(error, 'handlePreviousSession');
        }
    }

    handleNextSession() {
        try {
            if (this.currentSessionIndex < this.sessions.length - 1) {
                // Validate current session before moving to next
                const validationResult = this.validateCurrentSessionScores();
                if (validationResult.errors.length > 0) {
                    this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                    return;
                }
                
                this.currentSessionIndex++;
                this.debugLog('Next session:', this.currentSessionIndex);
            }
        } catch (error) {
            this.handleError(error, 'handleNextSession');
        }
    }

    async loadQuestionItems() {
        try {
            this.isLoading = true;
            
            // Collect all multiple choice question IDs from all sessions
            const multipleChoiceQuestionIds = [];
            
            this.sessions.forEach(session => {
                session.selectedQuestionValues.forEach(questionId => {
                    const questionDetails = this.questionDetailsMap.get(questionId);
                    if (questionDetails) {
                        const type = questionDetails.type;
                        
                        if (type === 'Choosable' || type === 'Multi-Choosable') {
                            multipleChoiceQuestionIds.push(questionId);
                        }
                    }
                });
            });
            
            if (multipleChoiceQuestionIds.length > 0) {
                this.debugLog('Loading items for questions:', multipleChoiceQuestionIds);
                
                const items = await getQuestionItems({ questionIds: multipleChoiceQuestionIds });
                
                // Group items by question ID
                this.questionItems = {};
                items.forEach(item => {
                    const questionId = item.AssessmentQuestion__c;
                    if (!this.questionItems[questionId]) {
                        this.questionItems[questionId] = [];
                    }
                    
                    this.questionItems[questionId].push({
                        id: item.Id,
                        content: item.Content__c,
                        order: item.Order__c,
                        score: 0 // Initialize score to 0
                    });
                });
                
                // Sort items by order
                Object.keys(this.questionItems).forEach(questionId => {
                    this.questionItems[questionId].sort((a, b) => a.order - b.order);
                });
                
                this.debugLog('Question items loaded:', this.questionItems);
            }
        } catch (error) {
            this.showToast('Error', 'Failed to load question items: ' + error.message, 'error');
            this.debugLog('Error loading question items:', error);
        } finally {
            this.isLoading = false;
        }
    }

    // Score Management
    handleQuestionScoreChange(event) {
        try {
            const questionId = event.target.dataset.questionId;
            const newScore = parseFloat(event.target.value) || 0;
            
            const sessionId = this.currentSession.id;
            this.sessions = this.sessions.map(session => {
                if (session.id === sessionId) {
                    const updatedScores = { ...session.questionScores };
                    updatedScores[questionId] = newScore;
                    return { ...session, questionScores: updatedScores };
                }
                return session;
            });
            
            this.debugLog('Question score changed:', questionId, newScore);
        } catch (error) {
            this.handleError(error, 'handleQuestionScoreChange');
        }
    }

    handleQuestionItemScoreChange(event) {
        try {
            const questionId = event.target.dataset.questionId;
            const itemId = event.target.dataset.itemId;
            const newScore = parseFloat(event.target.value) || 0;
            
            // Update the item score in questionItems
            if (this.questionItems[questionId]) {
                this.questionItems[questionId] = this.questionItems[questionId].map(item => {
                    if (item.id === itemId) {
                        return { ...item, score: newScore };
                    }
                    return item;
                });
                
                // Force re-render
                this.questionItems = { ...this.questionItems };
            }
            
            this.debugLog('Question item score changed:', questionId, itemId, newScore);
        } catch (error) {
            this.handleError(error, 'handleQuestionItemScoreChange');
        }
    }

    // Save Operations
    async handleSave() {
        try {

            if (this.isLoading) {
                return; // ✅ 추가 필요 - 중복 저장 방지
            }

            // Validate all sessions before saving
            const validationResult = this.validateAllSessions();
            if (validationResult.errors.length > 0) {
                this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                return;
            }
            
            await this.saveTemplate();
        } catch (error) {
            this.handleError(error, 'handleSave');
        }
    }

    async handleSaveAndNew() {
        try {
            if (this.isLoading) {   
                return; // ✅ 추가 필요 - 중복 저장 방지
            }   

            // Validate all sessions before saving
            const validationResult = this.validateAllSessions();
            if (validationResult.errors.length > 0) {
                this.showToast('Validation Error', validationResult.errors.join(' '), 'error');
                return;
            }
            
            const success = await this.saveTemplate();
            if (success) {
                this.resetForm();
            }
        } catch (error) {
            this.handleError(error, 'handleSaveAndNew');
        }
    }

    async saveTemplate() {
        this.isLoading = true;
        
        try {
            const templateData = this.buildTemplateData();            
            const resultJson = await createAssessmentTemplate({ templateData: JSON.stringify(templateData) });
            
            // Parse the result
            const result = JSON.parse(resultJson);
            
            // Check if save was successful
            if (result.success) {
                this.showToast('Success', result.message || 'Assessment Template created successfully', 'success');
                this.close('saved');
                return true;
            } else {
                this.showToast('Error', result.message || 'Failed to create Assessment Template', 'error');
                return false;
            }
            
        } catch (error) {
            this.showToast('Error', 'Failed to create Assessment Template: ' + (error.body?.message || error.message), 'error');
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    buildTemplateData() {
        try {
            const data = {
                templateName: this.templateName,
                templateDescription: this.description, // Changed from 'description' to match Apex
                isActive: this.isActive,
                sessions: this.sessions.map(session => ({
                    name: session.name,
                    score: session.score,
                    questions: session.selectedQuestionValues.map((questionId, index) => {
                        const questionDetails = this.questionDetailsMap.get(questionId);
                        const questionData = {
                            questionId: questionId,
                            order: index + 1,
                            score: session.questionScores?.[questionId] || 0,
                            type: questionDetails ? questionDetails.type : 'Short Answer' // Add question type
                        };
                        
                        // Add items if this is a multiple choice question
                        if (this.questionItems[questionId]) {
                            questionData.questionItems = this.questionItems[questionId].map(item => ({ // Changed from 'items' to 'questionItems'
                                id: item.id,
                                content: item.content,
                                order: item.order,
                                score: item.score
                            }));
                        }
                        
                        return questionData;
                    })
                }))
            };
            return data;
        } catch (error) {
            this.handleError(error, 'buildTemplateData');
            return null;
        }
    }

    resetForm() {
        try {
            this.templateName = '';
            this.description = '';
            this.isActive = true;
            this.sessions = [];
            this.questionItems = {};
            this.currentStep = 1;
            this.currentSessionIndex = 0;
            this.initializeDefaultSession();
        } catch (error) {
            this.handleError(error, 'resetForm');
        }
    }

    // Validation Methods
    validateStep1() {
        try {
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
                if (session.selectedQuestionValues.length === 0) {
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
            this.handleError(error, 'validateStep1');
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
            
            // Get questions with scores
            const sessionQuestions = this.currentSessionQuestions;
            
            // Validate each question score
            sessionQuestions.forEach((question, index) => {
                const score = session.questionScores?.[question.id];
                
                if (score === '' || score === null || score === undefined) {
                    errors.push(`Question ${index + 1} (${question.text}) score is required.`);
                } else {
                    const scoreValue = parseFloat(score);
                    if (isNaN(scoreValue) || scoreValue < 0) {
                        errors.push(`Question ${index + 1} (${question.text}) score must be a valid positive number.`);
                    }
                    
                    // Validate multiple choice item scores
                    const isMultipleChoice = question.type === 'Choosable' || question.type === 'Multi-Choosable';
                    if (isMultipleChoice) {
                        const items = this.questionItems[question.id] || [];
                        if (items.length > 0) {
                            const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
                            
                            if (maxItemScore !== scoreValue) {
                                errors.push(`Question ${index + 1} (${question.text}): The highest item score (${maxItemScore}) must equal the question score (${scoreValue}).`);
                            }
                        }
                    }
                }
            });
            
            // Validate total equals session score
            const sessionScore = parseFloat(session.score || 0);
            const questionsTotalScore = sessionQuestions.reduce((total, q) => {
                return total + parseFloat(session.questionScores?.[q.id] || 0);
            }, 0);
            
            if (Math.abs(sessionScore - questionsTotalScore) >= 0.01) {
                errors.push(`Question scores total (${questionsTotalScore}) must equal session score (${sessionScore}).`);
            }
            
            return { errors, warnings: [] };
        } catch (error) {
            this.handleError(error, 'validateCurrentSessionScores');
            return { errors: ['Validation error occurred'], warnings: [] };
        }
    }
    
    validateAllSessions() {
        try {
            const errors = [];
            
            this.sessions.forEach((session, sessionIndex) => {
                // Get question details for this session
                const sessionQuestions = session.selectedQuestionValues.map(questionId => {
                    const questionDetails = this.questionDetailsMap.get(questionId);
                    const score = session.questionScores?.[questionId] || 0;
                    const text = questionDetails ? questionDetails.name : questionId;
                    const type = questionDetails ? questionDetails.type : 'Unknown';
                    
                    return {
                        id: questionId,
                        text: text,
                        type: type,
                        score: score
                    };
                });
                
                // Validate each question
                sessionQuestions.forEach((question, questionIndex) => {
                    if (question.score === '' || question.score === null || question.score === undefined) {
                        errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1} (${question.text}): Score is required.`);
                    } else {
                        const scoreValue = parseFloat(question.score);
                        if (isNaN(scoreValue) || scoreValue < 0) {
                            errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1} (${question.text}): Score must be a valid positive number.`);
                        }
                        
                        // Validate multiple choice item scores
                        const isMultipleChoice = question.type === 'Choosable' || question.type === 'Multi-Choosable';
                        if (isMultipleChoice && this.questionItems[question.id]) {
                            const items = this.questionItems[question.id] || [];
                            if (items.length > 0) {
                                const maxItemScore = Math.max(...items.map(item => parseFloat(item.score || 0)));
                                
                                if (maxItemScore !== scoreValue) {
                                    errors.push(`Session ${sessionIndex + 1}, Question ${questionIndex + 1} (${question.text}): The highest item score (${maxItemScore}) must equal the question score (${scoreValue}).`);
                                }
                            }
                        }
                    }
                });
                
                // Validate session total
                const sessionScore = parseFloat(session.score || 0);
                const questionsTotal = sessionQuestions.reduce((total, q) => total + parseFloat(q.score || 0), 0);
                
                if (Math.abs(sessionScore - questionsTotal) >= 0.01) {
                    errors.push(`Session ${sessionIndex + 1}: Question scores total (${questionsTotal}) must equal session score (${sessionScore}).`);
                }
            });
            
            return { errors, warnings: [] };
        } catch (error) {
            this.handleError(error, 'validateAllSessions');
            return { errors: ['Validation error occurred'], warnings: [] };
        }
    }

    // Modal Actions
    handleCancel() {
        try {
            this.close();
        } catch (error) {
            this.handleError(error, 'handleCancel');
        }
    }

    // Utility Methods
    showToast(title, message, variant) {
        try {
            const event = new ShowToastEvent({
                title,
                message,
                variant,
            });
            this.dispatchEvent(event);
        } catch (error) {
            console.error('Error showing toast:', error);
        }
    }

    debugLog(message, data = null) {
        try {
            if (DEBUG) {
                console.log(`[AssessmentTemplateModal] ${message}`, data);
            }
        } catch (error) {
            console.error('Error in debugLog:', error);
        }
    }

    handleError(error, context) {
        try {
            console.error(`[${context}]`, error);
            const message = error?.body?.message || error?.message || 'An unexpected error occurred.';
            this.showToast('Error', `${context}: ${message}`, 'error');
        } catch (handlerError) {
            console.error('Error in error handler:', handlerError);
        }
    }
}