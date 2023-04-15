const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running at http:/localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//User Registration
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(getUser);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUser = `
            INSERT INTO 
                user ( name, username, password, gender)
            VALUES('${name}','${username}','${hashedPassword}','${gender}');`;

      await database.run(createUser);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(getUser);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const validPassword = await bcrypt.compare(password, dbUser.password);
    if (validPassword === true) {
      const jwtToken = jwt.sign(dbUser, "qwertyuiop");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const accessToken = (request, response, next) => {
  let jwtToken;
  const tokenHeader = request.headers["authorization"];
  if (tokenHeader !== undefined) {
    jwtToken = tokenHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "qwertyuiop", async (error, user) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.userId = user.user_id;
        next();
      }
    });
  }
};

//Get tweets of users followed by the user
app.get("/user/tweets/feed/", accessToken, async (request, response) => {
  const { userId } = request;
  //const { user_id, name, username, gender } = user;
  const getTweets = `SELECT username,tweet,date_time as dateTime
    FROM follower JOIN tweet ON following_user_id=tweet.user_id
    JOIN user ON following_user_id=user.user_id WHERE follower_user_id=${userId}
    ORDER BY dateTime DESC
    LIMIT 4;`;
  const data = await database.all(getTweets);
  response.send(data);
});

//Get names of users followed by the user
app.get("/user/following/", accessToken, async (request, response) => {
  const { userId } = request;
  const getNames = `SELECT name FROM user JOIN follower ON user_id=following_user_id
    WHERE follower_user_id=${userId};`;
  const data = await database.all(getNames);
  response.send(data);
});

//Get names of users who follows the user
app.get("/user/followers/", accessToken, async (request, response) => {
  const { userId } = request;
  const getNames = `SELECT name FROM user JOIN follower ON user_id=follower_user_id
    WHERE following_user_id=${userId};`;
  const data = await database.all(getNames);
  response.send(data);
});

//Get tweets API-6
app.get("/tweets/:tweetId/", accessToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsData = await database.get(tweetsQuery);
  const followersQuery = `SELECT * FROM follower JOIN user ON user_id=following_user_id
  WHERE follower_user_id=${userId};`;
  const followersData = await database.all(followersQuery);
  if (
    followersData.some((each) => each.following_user_id === tweetsData.user_id)
  ) {
    const { tweet_id, date_time, tweet } = tweetsData;
    const getLikes = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${tweet_id}
    GROUP BY tweet_id;`;
    const likesData = await database.get(getLikes);

    const getReplies = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${tweet_id}
    GROUP BY tweet_id;`;
    const replyData = await database.get(getReplies);
    response.send({
      tweet,
      likes: likesData.likes,
      replies: replyData.replies,
      dateTime: date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//AP1-7
app.get("/tweets/:tweetId/likes/", accessToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getUsernames = `SELECT * FROM tweet JOIN follower ON tweet.user_id=following_user_id JOIN like
    ON tweet.tweet_id=like.tweet_id JOIN user ON user.user_id=like.user_id
    WHERE tweet.tweet_id=${tweetId} AND follower_user_id=user.user_id;`;
  const data = await database.all(getUsernames);
  if (data.length !== 0) {
    let likes = [];
    for (let user of data) {
      likes.push(user.username);
    }
    response.send({ likes });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-8
app.get("/tweets/:tweetId/replies/", accessToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getUserReplies = `SELECT * FROM tweet JOIN follower ON tweet.tweet_id=following_user_id
    JOIN reply ON tweet.tweet_id=reply.tweet_id JOIN user ON user.user_id=reply.user_id
    WHERE tweet.tweet_id=${tweetId} AND follower_user_id=${userId};`;
  const data = await database.all(getUserReplies);
  if (data.length !== 0) {
    let replies = [];
    for (let each of data) {
      let obj = {
        name: each.name,
        reply: each.reply,
      };
      replies.push(obj);
    }
    response.send({ replies });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Get user tweets
app.get("/user/tweets/", accessToken, async (request, response) => {
  const { userId } = request;
  const getAllTweets = `SELECT tweet.tweet,count(DISTINCT like.like_id) AS likes,
    count(DISTINCT reply.reply) AS replies,tweet.date_time AS dateTime FROM user JOIN tweet ON
    tweet.user_id=user.user_id JOIN like ON like.tweet_id=tweet.tweet_id JOIN reply ON
    reply.tweet_id=tweet.tweet_id WHERE user.user_id=${userId} GROUP BY tweet.tweet_id;`;
  const data = await database.all(getAllTweets);
  response.send(data);
});

//Create tweet
app.post("/user/tweets/", accessToken, async (request, response) => {
  const { userId } = request;
  const { tweet } = request.body;
  const createTweet = `INSERT INTO tweet(tweet,user_id) VALUES('${tweet}',${userId});`;
  await database.run(createTweet);
  response.send("Created a Tweet");
});

//Delete tweet
app.delete("/tweets/:tweetId", accessToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getUser = `SELECT * from tweet WHERE tweet.user_id=${userId} AND tweet.tweet_id=${tweetId};`;
  const userData = await database.all(getUser);
  if (userData.length !== 0) {
    const deleteTweet = `DELETE FROM tweet WHERE tweet.user_id=${userId} AND tweet.tweet_id=${tweetId};`;
    await database.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
