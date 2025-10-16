({
    /**
     * @description Handle page reference changes to extract URL parameters
     * @param {Object} component - Aura component instance
     * @param {Object} event - Change event
     * @param {Object} helper - Helper object
     */
    onPageReferenceChange: function(component, event, helper) {
        // Extract page reference
        const pageReference = component.get('v.pageReference');
        
        if (pageReference && pageReference.state) {
            // Extract parameters from URL state
            const state = pageReference.state;
            
            // Set recordId if available (for edit scenarios)
            if (state.recordId) {
                component.set('v.recordId', state.recordId);
            }
            
            // Set object API name if available
            if (state.objectApiName) {
                component.set('v.objectApiName', state.objectApiName);
            }
            
            // Store full state for debugging
            component.set('v.state', state);
        }
    }
})