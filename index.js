const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const morgan = require('morgan')

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

        app.put('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
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
            const result = await campsCollection.find().toArray()
            res.send(result)
        })

        app.get('/medical-camp/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const decodedEmail = req.user?.email;

            if (!decodedEmail) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }

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