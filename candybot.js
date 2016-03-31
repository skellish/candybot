
function exit() {
	statusLedPin.unexport();
	motorPin.unexport();
	process.exit();
}

function debugOut() {
	if (debug) {
		console.log(Array.prototype.slice.call(arguments));
	}
}

function registerAndSubscribe() {
	// Register with our shadow thing
	debugOut('registering ' + thingName);
	cndyBotShadow.register(thingName, {
		ignoreDeltas : true,
		discardStale : true,
		enableVersioning : true,
		persistentSubscribe : true
	});
	debugOut('registered ' + thingName);

	// Request the current shadow values of the small/large dispense counts
	setTimeout(function () {
		opClientToken = cndyBotShadow.get('CNDYBOT');
		if (opClientToken === null) {
			debugOut('operation in progress');
		}
	}, 3000);

	// Subscribe to 'dispense' topic
	cndyBotShadow.subscribe(dispenseTopic, {
		qos : 1
	}, function (err, granted) {
		debugOut('suback', 'err: ', err, 'granted: ', granted);
	});
}

var awsIot = require('aws-iot-device-sdk');
var Gpio = require('onoff').Gpio;
var statusLedPin = new Gpio(18,'out');
var motorPin = new Gpio(24,'out');
var buttonPin = new Gpio(25, 'in');

var debug = false;
var thingName = 'CNDYBOT';
var dispenseTopic = 'itp/things/CandyBot/Dispense';

var cndyBotShadow = awsIot.thingShadow({
		//host: 'AK80W2OEZ9DZI.iot.us-east-1.amazonaws.com',
		host : 'AK80W2OEZ9DZI.iot.us-east-1.amazonaws.com',
		region : 'us-east-1',
		port : 8883,
		clientId : thingName,
		caCert : './certs/root-CA.crt',
		clientCert : './certs/3ac09d760a-certificate.pem.crt',
		privateKey : './certs/3ac09d760a-private.pem.key',
		debug : false
	});

var candyBotState = {
	"state" : {
		"reported" : {
			"dispensed" : {
				"small" : 0,
				"large" : 0
			}
		}
	},
	"metadata" : {
		"reported" : {
			"dispensed" : {
				"small" : {
					"timestamp" : 0
				},
				"large" : {
					"timestamp" : 0
				}
			}
		}
	},
	"version" : 0,
	"timestamp" : 0
};

cndyBotShadow.on('connect', function () {
	debugOut('connected');
	registerAndSubscribe();

	// Toggle status led indicating initialize complete
	statusLedPin.writeSync(1);
	setTimeout(function() {
		statusLedPin.writeSync(0);
	},0.5*1000);
	debugOut('Ready...');

});

cndyBotShadow.on('reconnect', function () {
	debugOut('reconnect/re-register');
	registerAndSubscribe();
});

cndyBotShadow.on('status', function (thingName, status, clientToken, stateObject) {

	if (status === 'rejected') {
		//
		// If an operation is rejected it is likely due to a version conflict;
		// request the latest version so that we synchronize with the thing
		// shadow.  The most notable exception to this is if the thing shadow
		// has not yet been created or has been deleted.
		//
		if (stateObject.code !== 404) {
			debugOut('resync with thing shadow');
			opClientToken = thingShadows.get(thingName);
			if (opClientToken === null) {
				debugOut('operation in progress');
			}
		}
	}
	if (status === 'accepted') {
		if (thingName === thingName) {
			candyBotState = stateObject;
		}
	}
	debugOut('status', 'ThingName: ', thingName, 'Status: ', status, 'ClientToken: ', clientToken, 'stateObject: ', JSON.stringify(stateObject));
});

cndyBotShadow.on('message', function (topic, message) {
	var payload = JSON.parse(message);
	if (topic == 'itp/things/CandyBot/Dispense') {
		var duration = 0;
		switch (payload.size) {
		case 'small':
			duration = 0.4;
			candyBotState.state.reported.dispensed.small++;
			break;
		case 'large':
			duration = 1.0;
			candyBotState.state.reported.dispensed.large++;
			break;
		}
		if (duration > 0) {
			// Motor on
			debugOut('motor on for ' + duration + ' seconds');
			motorPin.writeSync(1);

			// turn off the motor
			setTimeout(function () {
				debugOut('motor off');
				motorPin.writeSync(0);

				// And update shadow state with new dispensed count
				cndyBotShadow.update('CNDYBOT', candyBotState);
			}, duration * 1000);
		}
	}
	debugOut('message', 'topic: ', topic, 'payload: ', payload.toString());
});

cndyBotShadow.on('close', function () {
	debugOut('close');
});

cndyBotShadow.on('offline', function () {
	debugOut('offline');
});

cndyBotShadow.on('error', function (error) {
	debugOut('error', error);
});


