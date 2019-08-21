const express = require(`express`);
const bodyParser = require(`body-parser`); 
const cors = require(`cors`);
const bcrypt = require(`bcrypt`);
const Clarifai = require(`clarifai`);

// starting up server
const app = express();

// server configuration
app.use(cors());
app.use(bodyParser.json()); 

// initializing Clarifai
const clarifaiModule = new Clarifai.App({
	apiKey: '7ef291b3be3041ab8ae2f7dd9a13a8af'
});

// require db module, feed it configuaration obj
const knex = require(`knex`)({
	client: `pg`,
  connection: {
    host : `127.0.0.1`,     
    user : `postgres`,
    password : `korum121189data`, // should use 'dotenv' package to do it safe
    database : `facedetector`
  }
});

/* following route is used to provide the endpoint 
	for fetching Clarifai API */
app.post(`/imageurl`, (req, res) => {	
	const { input } = req.body;
	
	clarifaiModule.models
		.predict(Clarifai.FACE_DETECT_MODEL, input, {language: 'en'})
			.then(response => {
				if(response.status.code === 10000) {
					res.status(200).json({
						status: `ok`,
						content: response
					});
				} else {
					res.status(502).json({
						status: `failed to recognise face on url provided`
					});
				}
			})
			.catch(error => {
				res.status(400).json({
					status: `failed to recognise face due to invalid url`
				});
			});
});

/* following route is used to update user's entries
   input --> id / output --> user with updated entries */
app.put(`/image`, (req, res) => { 
	const { id:requestedId } = req.body;  
	
	knex(`users`)
		.returning(`*`)
		.increment(`entries`, 1)
		.where(`id`, `=`, requestedId)
		.then(user => {
			if(user.length !== 0) { // duplicated by `/profile/:id` --> wrap in a function
				res.status(200).json(user[0]);
			} else {
				res.status(404).json({ status: `provided id doesn't exist` }); // not used by front-end
			}	
		})
		.catch(error => res.status(400).json({ status: `failed to update entries` })); // not used by front-end
	
});

/* following route is used to login users
	 input --> user email and password / output--> user data from database*/
app.post(`/signin`, (req, res) => {
	const { email, password } = req.body;
	
	if(email === `` || password === ``) {
		res.status(400).json({ status: `incorrect form submission` });
	} else {
		knex
			.select(`email`, `hash`)
			.from(`login`)
			.where({ email: email })
			.then(data => {
				bcrypt.compare(password, data[0].hash)
					.then(result => {
						if(result) {
							knex
								.select(`*`)
								.from(`users`)
								.where({ email: email })
								.then(user => {
									res.status(200).json(user[0]);
								})
								.catch(error => {
									res.status(400).json({ status: `failed to fetch user` });
								})

						} else {
							res.status(400).json({ status: `failed to sign in` });
						}
					});
			})
			.catch(error => {
				res.status(400).json({ status: `failed to sign in` });
			});
	}	 
});

/* following route is used to register new users
	 input --> user name, email, password / output --> new created user */
app.post(`/register`, (req, res) => {	
	const { name, email, password } = req.body;

	if(name === `` || email === `` || password === ``) {
		res.status(400).json({ status: `incorrect form submission` });
	} else {
		bcrypt.hash(password, 10)
			.then(hash => { // storing the password hash in the database			
				knex.transaction(trx => { // using `trx` instead `knex` to do operations
					trx
						.insert({
							hash: hash, 
							email: email
						})
						.into(`login`)
						.returning(`email`)
						.then(userEmail => {						
							return trx // it will return a promise
								.insert({
									name: name, 
									email: userEmail[0], 
									joined: new Date()
								})
								.into(`users`)
								.returning(`*`)
								.then(user => res.json(user[0])) // sending back newly created user
								.catch(error => res.status(400).json({
									status: `unable to register`
								}));
						})
						.then(trx.commit) // success --> commit and end transaction  
			    	.catch(error => { // failure --> cancel updates and end transaction
			    		trx.rollback(error);
			    		res.status(400).json({ status: `unable to register` });
			    	}); 
				});
				
			})
			.catch(error => console.log(`error with password hashing`));
	}	
});

/* following route is not used by front-end
   input --> user id / output --> requested user */
app.get(`/profile/:id`, (req, res) => {
	const { id } = req.params;

	knex.select(`*`).from(`users`).where({ id: id })
		.then(user => {			
			if(user.length !== 0) {
				res.status(200).json(user[0]);
			} else {
				res.status(404).json({ status: `provided id doesn't exist` });
			}			
		})
		.catch(error => res.status(400).json({ status: `failed to fetch user` }));
	
});

app.listen(3001);