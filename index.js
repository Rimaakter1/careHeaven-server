const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const morgan = require('morgan')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const port = process.env.PORT || 5000
const app = express()
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.whq23.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})
async function run() {
    try {

        const db = client.db('CareHeaven')
        const usersCollection = db.collection('users')
        const campsCollection = db.collection('camps')
        const participantsCollection = db.collection('participants')
        const paymentsCollection = db.collection('payments')
        const feedbacksCollection = db.collection('feedbacks')


        const verifyAdmin = async (req, res, next) => {
            const email = req.user?.email
            const query = { email }
            const result = await usersCollection.findOne(query)
            if (!result || result?.role !== 'admin')
                return res
                    .status(403)
                    .send({ message: 'Forbidden Access! Admin Only Actions!' })

            next()
        }

        app.post('/users/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const user = req.body
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                return res.send(isExist)
            }
            const result = await usersCollection.insertOne({
                ...user,
                role: 'participant',
                timestamp: Date.now(),
            })
            res.send(result)
        })

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })

        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send({ role: result?.role })
        })

        app.put('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const userInfo = req.body;
            const result = await usersCollection.updateOne(
                { email },
                {
                    $set: { ...userInfo, timestamp: Date.now() },
                }
            );
            if (result.modifiedCount > 0) {
                return res.send({ success: true, message: 'Profile updated successfully' });
            }

        }
        );


        app.post('/camps', verifyToken, verifyAdmin, async (req, res) => {
            const camp = req.body
            const result = await campsCollection.insertOne(camp)
            res.send(result)
        })

        app.get('/camps', async (req, res) => {
            try {
                const sortField = req.query.sort || "participantCount";
                const sortOrder = req.query.order === "asc" ? 1 : -1;
                const limit = parseInt(req.query.limit) || 0;

                const result = await campsCollection
                    .find()
                    .sort({ [sortField]: sortOrder })
                    .limit(limit)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error("Error fetching camps:", error);
                res.status(500).send({ error: "Failed to fetch camps" });
            }
        });



        app.get('/camp/:campId', verifyToken, async (req, res) => {
            const campId = req.params.campId;
            const query = { _id: new ObjectId(campId) }
            const result = await campsCollection.findOne(query)
            res.send(result)
        })


        app.put('/update-camp/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const campData = req.body
            const updated = {
                $set: campData,
            }
            const query = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const result = await campsCollection.updateOne(query, updated, options)
            res.send(result)
        })

        app.delete('/delete-camp/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await campsCollection.deleteOne(query)
            res.send(result)
        })




        app.post('/participants', async (req, res) => {
            const participantData = req.body;
            const participantResult = await participantsCollection.insertOne(participantData);
            const query = { _id: new ObjectId(participantData.campId) };
            const update = { $inc: { participantCount: 1 } };
            const campResult = await campsCollection.updateOne(query, update);
            res.send({ participant: participantResult, campResult });
        });




        app.get('/participants/:email', async (req, res) => {
            const email = req.params.email;
            const result = await participantsCollection.aggregate([
                {
                    $match: { 'participantEmail': email },
                },
                {
                    $addFields: {
                        campId: { $toObjectId: '$campId' },
                    },
                },
                {
                    $lookup: {
                        from: 'camps',
                        localField: 'campId',
                        foreignField: '_id',
                        as: 'camps',
                    },
                },
                { $unwind: '$camps' },
                {
                    $addFields: {
                        campName: '$camps.name',
                        campFees: '$camps.Fees',
                        campLocation: '$camps.location',

                    },
                },
                {
                    $project: {
                        camps: 0,
                        _id: 1,
                    },
                },
            ]).toArray();

            res.send(result);
        });


        app.get('/participant-all-camps/:email', verifyToken, async (req, res) => {
            const participantEmail = req.params.email
            console.log(participantEmail);
            const result = await participantsCollection.find({ participantEmail }).toArray()
            res.send(result)
        })


        app.get('/participant/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await participantsCollection.findOne(query)
            res.send(result)
        })



        app.post('/create-payment-intent', async (req, res) => {
            const { campFees } = req.body;
            const amount = parseInt(campFees * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        app.post('/payments', async (req, res) => {
            try {
                const payment = req.body;
                const { participantId } = req.body;
                console.log('Request body:', req.body);
                if (!participantId) {
                    return res.status(400).send({ error: 'participantId is required in the request body' });
                }

                console.log('Extracted participantId:', participantId);
                const query = { _id: new ObjectId(participantId) };
                const participant = await participantsCollection.findOne(query);

                console.log('Found participant:', participant);

                if (!participant) {
                    return res.status(404).send({ error: 'Participant not found' });
                }

                const paymentResult = await paymentsCollection.insertOne(payment);

                const updateResult = await participantsCollection.updateOne(
                    { _id: participant._id },
                    {
                        $set: {
                            paymentStatus: 'Paid',
                        },
                    }
                );

                console.log('Payment update result:', updateResult);

                const updatedParticipant = await participantsCollection.findOne({ _id: participant._id });
                res.send({
                    paymentResult,
                    participant: updatedParticipant,
                });

            } catch (error) {
                console.error('Error in processing the payment:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });


        app.get('/payments/:email', async (req, res) => {
            const email = req.params.email;
            try {
                const result = await paymentsCollection.aggregate([
                    { $match: { email: email } },
                    {
                        $addFields: {
                            participantId: { $toObjectId: '$participantId' },
                        },
                    },
                    {
                        $lookup: {
                            from: 'participants',
                            localField: 'participantId',
                            foreignField: '_id',
                            as: 'participants',
                        },
                    },
                    { $unwind: '$participants' },
                    {
                        $addFields: {
                            campName: '$participants.campName',
                            campFees: '$participants.fees',
                            campLocation: '$participants.location',
                            paymentStatus: '$participants.paymentStatus',
                            paymentConfirmationStatus: '$participants.paymentConfirmationStatus'

                        },
                    },
                    {
                        $project: {
                            participants: 0,
                            _id: 0,
                        },
                    },
                ]).toArray();

                console.log(result);
                res.send(result);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send({ message: 'An error occurred', error });
            }
        });

        app.get('/payments', async (req, res) => {
            try {
                const result = await paymentsCollection.aggregate([
                    {
                        $addFields: {
                            participantId: { $toObjectId: '$participantId' },
                        },
                    },
                    {
                        $lookup: {
                            from: 'participants',
                            localField: 'participantId',
                            foreignField: '_id',
                            as: 'participants',
                        },
                    },
                    { $unwind: '$participants' },
                    {
                        $addFields: {
                            campName: '$participants.campName',
                            campFees: '$participants.fees',
                            campLocation: '$participants.location',
                            paymentStatus: '$participants.paymentStatus',
                            paymentConfirmationStatus: '$participants.paymentConfirmationStatus',
                            participantName: '$participants.participantName',

                        },
                    },
                    {
                        $project: {
                            participants: 0,
                            _id: 1,
                        },
                    },
                ]).toArray();

                console.log(result);
                res.send(result);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send({ message: 'An error occurred', error });
            }
        });


        app.delete('/cancel-registration/:id', verifyToken, async (req, res) => {
            const campId = req.params.id;
            const participantQuery = { campId };
            const participantDeleteResult = await participantsCollection.deleteOne(participantQuery);
            if (participantDeleteResult.deletedCount === 0) {
                return res.status(404).send({ message: "Participant not found" });
            }

            const campUpdateResult = await campsCollection.updateOne(
                { _id: new ObjectId(campId) },
                { $inc: { participantCount: -1 } }
            );

            res.send({
                participantDeleteResult,
                campUpdateResult,
            });

        });

        app.patch('/update-confirmation/:participantId', async (req, res) => {
            const { participantId } = req.params;
            const { paymentConfirmationStatus } = req.body;
            console.log('status', paymentConfirmationStatus);
            const result = await participantsCollection.updateOne(
                { _id: new ObjectId(participantId) },
                { $set: { paymentConfirmationStatus: paymentConfirmationStatus } }
            );

            if (result.modifiedCount === 1) {
                return res.send({ success: true });
            }

        });

        app.delete('/cancel-registered-participant/:participantId', verifyToken, verifyAdmin, async (req, res) => {
            const { participantId } = req.params;

            const result = await participantsCollection.deleteOne(
                { _id: new ObjectId(participantId) }
            );

            if (result.deletedCount === 1) {
                return res.send({ success: true });
            }
        });


        app.post("/submit-feedback", async (req, res) => {
            const { campId, feedback, rating, participantName, participantEmail, photo } = req.body;

            const result = await feedbacksCollection.insertOne({
                campId: new ObjectId(campId),
                feedback,
                rating,
                participantName,
                participantEmail,
                photo,
                createdAt: new Date(),
            });

            res.send({
                feedbackId: result.insertedId,
            });
        });


        app.get("/feedbacks", async (req, res) => {
            const feedbacks = await feedbacksCollection.find({}).toArray();
            res.send(feedbacks);

        });



        app.post('/jwt', async (req, res) => {
            const email = req.body
            const token = jwt.sign(email, process.env.SECRET_KEY, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
            } catch (err) {
                res.status(500).send(err)
            }
        })


        // Send a ping to confirm a successful connection
        await client.db('admin').command({ ping: 1 })
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from careHeavenNet Server..')
})

app.listen(port, () => {
    console.log(`careHeavenNet is running on port ${port}`)
})