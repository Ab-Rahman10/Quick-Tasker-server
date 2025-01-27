require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    // await client.connect();

    const db = client.db("quickTasker");
    const userCollection = db.collection("users");
    const taskCollection = db.collection("tasks");
    const submissionCollection = db.collection("submissions");
    const orderCollection = db.collection("orders");
    const withdrawCollection = db.collection("withdraws");
    const reviewCollection = db.collection("reviews");

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

    // users related APIs----------------------------------------------

    app.get("/users/best-workers", async (req, res) => {
      const users = await userCollection.find().toArray();
      const workerUsers = users
        .filter((user) => user.role === "worker")
        .sort((a, b) => b.availableCoins - a.availableCoins)
        .slice(0, 6);

      res.send(workerUsers);
    });

    app.get("/users/:email", verifyToken, async (req, res) => {
      const adminEmail = req.params.email;

      if (adminEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

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

    app.delete("/user-delete/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
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

    // Tasks related APIs---------------------------------------------------------------

    app.get("/tasks", verifyToken, async (req, res) => {
      const allTasks = await taskCollection.find().toArray();
      const result = allTasks.filter((task) => task.required_workers > 0);

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

    app.get("/task/:id", async (req, res) => {
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

    // this delete for Admin
    app.delete("/task-delete/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(filter);
      res.send(result);
    });

    // after clicking delete button in the buyer dashboard
    app.patch("/delete-refill-task", verifyToken, async (req, res) => {
      const id = req.body._id;

      // delete task
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(query);

      // refill coins for buyer
      const buyerEmail = req.body.email;
      const filter = { email: buyerEmail };
      const updateDoc = {
        $inc: {
          availableCoins: req.body.required_workers * req.body.payable_amount,
        },
      };
      const refillCoins = await userCollection.updateOne(filter, updateDoc);

      res.send({
        message:
          "The task was successfully deleted, and coins were refilled for the buyer.",
      });
    });

    // Submissions related APIs---------------------------------------------------------

    // Task to review
    app.get("/review-task/:email", verifyToken, async (req, res) => {
      const buyerEmail = req.params.email;

      if (buyerEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { buyer_email: buyerEmail };
      const pendingAllTasks = (
        await submissionCollection.find(query).toArray()
      ).filter((pendingSub) => pendingSub.status === "pending");

      res.send(pendingAllTasks);
    });

    // get total paid payment by buyer
    app.get("/total-paid-payment/:email", verifyToken, async (req, res) => {
      const user = req.params.email;
      const filter = { buyer_email: user };
      const allSubmissions = await submissionCollection.find(filter).toArray();
      const approveSubs = allSubmissions.filter(
        (approve) => approve.status === "Approved"
      );
      res.send(approveSubs);
    });

    // after clicking approve button
    app.patch("/approve-task", verifyToken, async (req, res) => {
      const data = req.body;

      // increase worker's coins
      const workerEmail = data.worker_email;
      const query = { email: workerEmail };
      const updateDoc = {
        $inc: {
          availableCoins: data.payable_amount,
        },
      };

      const result = await userCollection.updateOne(query, updateDoc);

      // Change the status
      const taskId = data.task_id;
      const filter = { task_id: taskId };
      const updateStatus = {
        $set: {
          status: "Approved",
        },
      };

      const statusResult = await submissionCollection.findOneAndUpdate(
        filter,
        updateStatus,
        { sort: { _id: -1 }, returnDocument: "after" }
      );

      // Decrease required workers count
      const id = data.task_id;
      const decrease_required_worker = {
        $inc: {
          required_workers: -1,
        },
      };

      const decreaseResult = await taskCollection.updateOne(
        { _id: new ObjectId(id) },
        decrease_required_worker
      );

      res.send({ message: "success" });
    });

    // after clicking reject button
    app.patch("/reject-task", verifyToken, async (req, res) => {
      const data = req.body;

      // increase required workers count
      const id = data.task_id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $inc: {
          required_workers: 1,
        },
      };

      const result = await taskCollection.updateOne(query, updateDoc);

      // Change the status
      const taskId = data.task_id;
      const filter = { task_id: taskId };
      const updateStatus = {
        $set: {
          status: "Rejected",
        },
      };

      const statusResult = await submissionCollection.findOneAndUpdate(
        filter,
        updateStatus,
        { sort: { _id: -1 }, returnDocument: "after" }
      );

      res.send({ message: "success" });
    });

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

    // Create payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: price * 100,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({ clientSecret: client_secret });
    });

    // Order related APIs---------------------------------------------------------

    app.get("/orders/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { "user.email": email };
      const result = await orderCollection.find(filter).toArray();
      res.send(result);
    });

    app.post("/order", verifyToken, async (req, res) => {
      const orderData = req.body;
      const result = await orderCollection.insertOne(orderData);
      res.send(result);
    });

    // Update coins after payment
    app.patch("/add-payment-coin/:email", verifyToken, async (req, res) => {
      // get payment coins
      const { orderId } = req.body;
      const query = { _id: new ObjectId(orderId) };
      const getCoins = await orderCollection.findOne(query);

      // increase coins
      const buyerEmail = req.params.email;
      const filter = { email: buyerEmail };
      const updateDoc = {
        $inc: {
          availableCoins: getCoins?.purchase?.coins,
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Withdraw related APIs-----------------------------------------------------------

    app.get("/withdraws", verifyToken, async (req, res) => {
      const result = await withdrawCollection.find().toArray();
      res.send(result);
    });

    app.post("/withdraw", verifyToken, async (req, res) => {
      const withdrawData = req.body;
      const result = await withdrawCollection.insertOne(withdrawData);
      res.send(result);
    });

    // after clicking payment success button
    app.patch("/payment-success", verifyToken, async (req, res) => {
      const { _id, coins, user } = req.body;

      // Change the status
      const filter = { _id: new ObjectId(_id) };
      const updateStatus = {
        $set: {
          status: "Approved",
        },
      };
      const withdrawData = await withdrawCollection.updateOne(
        filter,
        updateStatus
      );

      // Decrease the user coins
      const email = user.email;
      const query = { email: email };
      const { availableCoins } = await userCollection.findOne(query);
      const decreaseCoins = {
        $set: {
          availableCoins: availableCoins - coins,
        },
      };

      const resultCoins = await userCollection.updateOne(query, decreaseCoins);
      res.send({ message: "success" });
    });

    // Reviews related APIs-----------------------------------------------------------
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
