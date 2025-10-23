/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-22
 * @last modified by  : mingyu.park@dkbmc.com
**/
public with sharing class bootApex {
    public bootApex() {
        List<Account> accountsToDelete = [SELECT Id FROM Account WHERE Type = 'Inactive'];

        try {
            delete accountsToDelete;
            System.debug('Successfully deleted ' + accountsToDelete.size() + ' accounts');
        } catch (DmlException e) {
            System.debug('Error deleting accounts: ' + e.getMessage());
        }
    }
}