/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-17
 * @last modified by  : mingyu.park@dkbmc.com
**/
public with sharing class DKEDU_DebugUtils {

    // Debug switch following DK Lab standards
    public static final Boolean DEBUG = true;
    
    /**
     * @description Log message with object serialization
     * @param message Log message
     * @param obj Object to serialize and log
     */
    public static void log(String message, Object obj) {
        if (DEBUG) {
            try {
                System.debug(message + ' -> ' + JSON.serialize(obj));
            } catch (Exception e) {
                System.debug(message + ' -> [Serialization Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    /**
     * @description Log message with list of objects
     * @param message Log message
     * @param lobj List of objects to serialize and log
     */
    public static void log(String message, List<Object> lobj) {
        if (DEBUG) {
            try {
                System.debug(message + ' -> ' + JSON.serialize(lobj));
            } catch (Exception e) {
                System.debug(message + ' -> [List Serialization Error: ' + e.getMessage() + ']');
            }
        }
    }
    
    /**
     * @description Log simple message
     * @param message Log message
     */
    public static void log(String message) {
        if (DEBUG) {
            System.debug(message);
        }
    }
    
    /**
     * @description Log exception with detailed information
     * @param message Log message
     * @param e Exception to log
     */
    public static void log(String message, Exception e) {
        if (DEBUG) {
            System.debug(message + ' -> Exception: ' + e.getMessage());
            System.debug(message + ' -> Stack Trace: ' + e.getStackTraceString());
            System.debug(message + ' -> Exception Type: ' + e.getTypeName());
        }
    }
}