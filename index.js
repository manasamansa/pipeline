/**
 * This function is to check Contact Center is open or not.
 * This function will do emergency, weather, holiday and out of office hours check
 * Input Parameters: Amazon Connect Event o
 * Return Parameters : emergencyAllFlag, emergencyAllMessage, emergencyFlag, emergencyMessage, weatherFlag, weatherMessage, holidayFlag, holidayMessage, workingHoursFlag, workingHoursMessage, earlyWorkingHoursFlag
 */

/**
 * Initialize AWS, DynamoDB & Return Object
 */
const AWS           = require( "aws-sdk" );
const region        = process.env.REGION;
const timeZone      = process.env.TZ;
const docClient     = new AWS.DynamoDB.DocumentClient( { region: region } );	

let returnObject    = {};

/**
 * Initialize LambdaHelper for date time comparison
 */
const util = require('/opt/nodejs/CommonHelperFunctions'); 

/**
 * Function to query WorkingHoursCheck table for open hours
 */

function getOfficeHoursDataFromDB(  weekDay, currentDate, currentDateFormatted, currentTimeStamp, WHCType )  {
	
	// Initialize expressionAttributesObject and set values
	let expressionAttributesObject = {};

    expressionAttributesObject[":emergencyAll"] 	= "EmergencyAll";
    expressionAttributesObject[":emergency"] 		= "Emergency";
    expressionAttributesObject[":weather"] 			= "Weather";
    expressionAttributesObject[":WHC"] 				= "WHC";
    expressionAttributesObject[":holiday"] 			= "Holiday";
    expressionAttributesObject[":weekDay"] 			= weekDay;
    expressionAttributesObject[":date"] 			= currentDateFormatted;
    expressionAttributesObject[":WHCType"] 			= WHCType;

	// Parameter Object for DB Query
	var params = {
		TableName: process.env.OFFICEHOURSTABLE,
		ProjectionExpression: "#type, #day, #date, #startTime, #endTime, #message, #weatherFlag, #emergencySpecialFlag",
	    FilterExpression: "(#type = :emergencyAll) OR ( #type = :weather and #WHCType= :WHCType) OR ( #type = :emergency and #WHCType= :WHCType ) OR ( #type = :WHC and  #day = :weekDay and #WHCType= :WHCType ) OR ( #type = :holiday and #date = :date and #WHCType= :WHCType ) ",
		ExpressionAttributeNames: {
			"#type": "type",
			"#WHCType": "WHCType",
			"#day": "day",
			"#date": "date",
			"#startTime" : "startTime",
			"#endTime" : "endTime",
			"#message": "message",
			"#weatherFlag" : "weatherFlag",
			"#emergencySpecialFlag" : "emergencySpecialFlag"
		},
		ExpressionAttributeValues: expressionAttributesObject,
	};
	// Scan operation
	return docClient.scan( params ).promise();
	

}
/**
 * Function to get open hours data and set to returnObject values accordingly. 
 */
function processOfficeHoursData( weekDay, currentDate, currentDateFormatted, currentTimeStamp, WHCType )  {
    //Function call get open hours data
    return getOfficeHoursDataFromDB( weekDay, currentDate, currentDateFormatted, currentTimeStamp, WHCType )
        .then( function( officeHoursData ) {
			// Set Closed Working Hours message. @todo- replace this with DB prompt
        	let closeWorkingHourMessage = '';
        	if( WHCType == 'Main' ) {
        		closeWorkingHourMessage = " <speak>  <prosody pitch=\"medium\">Our office is currently closed. Our normal business hours are Monday through Friday, <prosody rate=\"95%\">9AM  to 5PM,</prosody> and  Saturday, <prosody rate=\"95%\">9AM to 1PM, </prosody>Eastern Standard time.  <break/>If you would like to use our automated phone system, press 1. Otherwise please call back during operating  hours. </prosody> </speak>";
        	} else {
        		closeWorkingHourMessage = " <speak>  <prosody pitch=\"medium\">Our office is  currently closed. Our normal business hours are Monday through Friday, <prosody rate=\"95%\">9AM  to 5PM,</prosody> and  Saturday, <prosody rate=\"95%\">9AM to 1PM, </prosody>Eastern Standard time.  <break/>Please call back on our next  business day.</prosody> </speak>";
        	}
			// Set default values for return object
            let returnDBObject                    = {
				emergencyAllFlag : "FALSE",
				emergencyAllMessage : "",
				emergencyFlag : "FALSE",
				emergencyMessage : "",
				weatherFlag : "FALSE",
				weatherMessage : "",
				holidayFlag : "FALSE",
				holidayMessage : "",
				workingHoursFlag : "FALSE",
				workingHoursMessage : closeWorkingHourMessage , 
				earlyWorkingHoursFlag : "FALSE"
			};
            // Loop through DB return data and set values accordingly
            if ( officeHoursData.Count > 0 && ( Object.prototype.hasOwnProperty.call( officeHoursData, 'Items' ) ) ) {
                for( var counter = 0; counter < officeHoursData.Items.length; counter++ ) {	
					if( officeHoursData.Items[counter].type === 'EmergencyAll' && officeHoursData.Items[counter].emergencySpecialFlag.toUpperCase() === 'TRUE' ) {						
						returnDBObject.emergencyAllFlag 	= 'TRUE';
						returnDBObject.emergencyAllMessage 	= officeHoursData.Items[counter].message;
					}
					if( officeHoursData.Items[counter].type === 'Emergency' && officeHoursData.Items[counter].emergencySpecialFlag.toUpperCase() === 'TRUE' ) {
						returnDBObject.emergencyFlag 		= 'TRUE';
						returnDBObject.emergencyMessage 	= officeHoursData.Items[counter].message;
					}
					if( officeHoursData.Items[counter].type === 'Weather' && officeHoursData.Items[counter].weatherFlag.toUpperCase() === 'TRUE' ) {
						returnDBObject.weatherFlag 		= 'TRUE';
						returnDBObject.weatherMessage 	= officeHoursData.Items[counter].message;
					}
					if( officeHoursData.Items[counter].type === 'Holiday'  ) {						
					
						//Creates dateComparsionObject to pass to DateComparision Helper Function
						let dateComparsionObject    = { 
							startTime : officeHoursData.Items[counter].startTime, 
							endTime : officeHoursData.Items[counter].endTime, 
							currentDate : currentDate, 
							currentTimeStamp : currentTimeStamp, 
							holidayCloseMessage : officeHoursData.Items[counter].message, 
							type: "HolidayCheck" 
						};
						// Call helper function from lambda layer to compare current date's timestamp with DB Holiday timestamp. Receive response from helper function in return Object
						returnDBObject         = util.dateComparision( dateComparsionObject, returnDBObject );
						
					}
					
					if( officeHoursData.Items[counter].type === 'WHC' ) {
					
						//Creates dateComparsionObject to pass to DateComparision Helper Function
						let dateComparsionObject    = { 
							startTime : officeHoursData.Items[counter].startTime, 
							endTime : officeHoursData.Items[counter].endTime, 
							currentDate : currentDate, 
							currentTimeStamp : currentTimeStamp, 
							workingHoursMessage : officeHoursData.Items[counter].message, 
							type: "WorkingHourCheck" 
						};
						// Call helper function from lambda layer to compare current date's timestamp with DB Working hour's timestamp. Receive response from helper function in return Object
						returnDBObject         = util.dateComparision( dateComparsionObject, returnDBObject );
					}
					
					if( officeHoursData.Items[counter].type === 'WHC' ) {

						//Creates dateComparsionObject to pass to DateComparision Helper Function
						let dateComparsionObject    = { 
							startTime : officeHoursData.Items[counter].startTime, 
							endTime : officeHoursData.Items[counter].endTime, 
							currentDate : currentDate, 
							currentTimeStamp : currentTimeStamp, 
							workingHoursMessage : officeHoursData.Items[counter].message, 
							type: "WorkingHourCheck" 
						};
						// Call helper function from lambda layer to compare current date's timestamp with DB Working hour's timestamp. Receive response from helper function in return Object
						returnDBObject         = util.dateComparision( dateComparsionObject, returnDBObject );
					}
				
				}

            }
            return new Promise( function( resolve, reject ) {
                	resolve( returnDBObject );
		        
            });

        } ).catch( function( err ) {
        	console.error(' Catch case inside  officeHoursData error json ' + JSON.stringify( err ) );

            let returnDBObject                    = {};
            returnDBObject.ErrorOccured = 'TRUE';
            returnDBObject.ErrorMessage = 'Problem occured during execution. Kindly try again.';
            return new Promise( function( resolve, reject ) {
            	resolve( returnDBObject );
            } );
        } );
}

/**
 * Function to get, set and return Working Hours data
 */
async function checkOfficeHours( event) {
	// Get WHCType from attributes
//	let WHCType = event.Details.ContactData.Attributes.WHCType;
    let WHCType='Main';
    //Get the current date in EST time zone
    let dateESTTimeZone         = new Date().toLocaleString('en-US', {
        timeZone: timeZone
    } );
    let currentDate             = new Date( dateESTTimeZone );
	//Get current time stamp
    let currentTimeStamp        = new Date( dateESTTimeZone ).getTime();

    //Get week day 
    const weekDayList           = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let weekDay = weekDayList[currentDate.getDay()];
	
	// Get today's date
	let currentDateFormatted	= '';
	let month                           = currentDate.getMonth() + 1;
    let day                             = currentDate.getDate();
    let year                            = currentDate.getFullYear();
    if( day < 10 ) {
        day='0' + day;
    }
    if( month < 10 ) {
        month='0' + month;
    }
    currentDateFormatted               	= month + '-' + day + '-' + year;
	
	// Call processOfficeHoursData to get and set office hours data in return object
	let officeHoursData = await processOfficeHoursData( weekDay, currentDate, currentDateFormatted, currentTimeStamp, WHCType ) ;

    // Return Promise object
    return new Promise(function( resolve, reject ) {
        	resolve( officeHoursData );
        
    });

}
//--------------- Main handler -----------------------//
exports.handler = async( event, context, callback ) => {
	
    console.log(" Event Object :", JSON.stringify( event ));
    console.log(" Context Object :", JSON.stringify( context ));
    console.log(" Callback Object :", JSON.stringify( callback ));
    returnObject    = {};

    try {
        // Function call to check office hours
        returnObject            = await checkOfficeHours( event );
        console.log('returnObject Final ' + JSON.stringify( returnObject ) );
        callback( null, returnObject );
    }
    catch ( err ) {
        console.error( ' Error ' + JSON.stringify( err ) );
        callback( null, returnObject );
    }
};
