require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
  })
);
app.use(express.json());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.euk0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("quickTasker");
    const userCollection = db.collection("users");
    const taskCollection = db.collection("tasks");
    const submissionCollection = db.collection("submissions");

    // JWT------------------------------------
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });
      res.send(token);
    });

    // middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }

        req.decoded = decoded;
        next();
      });
    };

    // const verifyRole = (requiredRole) => {
    //   return async (req, res, next) => {
    //     const email = req.decoded.email;
    //     const user = await userCollection.findOne({ email });
    //     if (user?.role !== requiredRole) {
    //       return res.status(403).send({ message: "Forbidden access" });
    //     }
    //     next();
    //   };
    // };

    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decoded.email;
    //   const filter = { email };
    //   const user = await userCollection.findOne(filter);
    //   const isAdmin = user?.role === "admin";

    //   if (!isAdmin) {
    //     return res.status(403).send({ message: "Forbidden access" });
    //   }
    //   next();
    // };

    // users related APIs----------------------------------------------

    app.get("/users/:email", verifyToken, async (req, res) => {
      const adminEmail = req.params.email;
      const filter = { email: { $ne: adminEmail } };
      const result = await userCollection.find(filter).toArray();
      res.send(result);
    });

    app.get("/users/coins/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const user = await userCollection.findOne(filter);
      res.send({ coins: user?.availableCoins });
    });

    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const email = userInfo.email;
      const filter = { email };
      const existingEmail = await userCollection.findOne(filter);
      if (existingEmail) {
        return res.send({ message: "This user is already exists." });
      }
      const result = await userCollection.insertOne(userInfo);
      res.send(result);
    });

    // Update user role
    app.patch("/user-role-update/:id", verifyToken, async (req, res) => {
      const userId = req.params.id;
      const query = { _id: new ObjectId(userId) };
      const roleData = req.body;
      const updatedRole = {
        $set: {
          role: roleData.role,
        },
      };
      const result = await userCollection.updateOne(query, updatedRole);
      res.send(result);
    });

    // getting role
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const filter = { email };
      const user = await userCollection.findOne(filter);

      res.send({ role: user?.role });
    });

    // Tasks related --------------------------------------------

    app.get("/tasks", verifyToken, async (req, res) => {
      const result = await taskCollection.find().toArray();
      res.send(result);
    });

    app.get("/tasks/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const result = await taskCollection
        .find(filter)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    // for task details-----------------
    app.get("/task-details/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(filter);
      res.send(result);
    });

    app.get("/task/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(filter);
      res.send(result);
    });

    app.post("/task", async (req, res) => {
      const taskData = req.body;
      const { email, required_workers, payable_amount } = taskData;
      const taskAdded = await taskCollection.insertOne(taskData);
      if (taskAdded.insertedId) {
        const coinsUpdatedResult = await userCollection.updateOne(
          {
            email: email,
          },
          {
            $inc: {
              availableCoins: -required_workers * payable_amount,
            },
          }
        );
        if (coinsUpdatedResult.modifiedCount > 0) {
          return res.send({ message: "Coins Updated successfully!" });
        }
      }
      res.send(taskAdded);
    });

    app.patch("/task/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { title, detail, submission_info } = req.body;
      console.log(id, title, detail, submission_info);

      const updateDoc = {
        $set: {
          title: title,
          detail: detail,
          submission_info: submission_info,
        },
      };

      const result = await taskCollection.updateOne(filter, updateDoc);
      console.log("result", result);

      res.send(result);
    });

    // Submissions related APIs---------------------------------------------------------

    app.get("/submissions/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email };
      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/submission", verifyToken, async (req, res) => {
      const submissionData = req.body;
      const result = await submissionCollection.insertOne(submissionData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Quick Tasker is running...");
});

app.listen(port, () => {
  console.log(`Quick Tasker is running on port ${port}`);
});
