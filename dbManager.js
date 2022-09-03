const { MongoClient } = require("mongodb");

class DBManager {
  constructor(
    server,
    port,
    username,
    password,
    dbName,
    collectionName,
    connectionRetryLimit,
    queryRetryLimit
  ) {
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.connectionRetryLimit = connectionRetryLimit;
    this.queryRetryLimit = queryRetryLimit;

    const dbURI = `mongodb://${encodedUsername}:${encodedPassword}@${server}:${port}/${dbName}`;
    const dbConfig = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      keepAlive: true,
    };
    this.client = new MongoClient(dbURI, dbConfig);
    this.connection = this.createConnection(connectionRetryLimit, 0);
  }

  async wait(delay) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, delay);
    });
  }

  getBackoff(delay) {
    let backoff = 0;
    //if first failure backoff of 0.25-0.5 seconds
    if (delay == 0) {
      backoff = 0.25 + Math.random() * 0.25;
    }
    //otherwise 2-3x current backoff
    else {
      backoff = 2 * delay + Math.random() * delay;
    }
    return backoff;
  }

  async createConnection(retries, delay) {
    await this.wait(delay);
    //maight have to have this return connection and set this.connection to result of this function
    //or definitely have to do that, because if retrying connection and something's waiting it will throw the original connection error, want to wait until this whole functions finished
    let connection = this.client.connect();
    try {
      await connection;
    } catch (err) {
      if (retries-- > 0) {
        delay = this.getBackoff(delay);
        this.createConnection(retries, delay);
      } else {
        throw err;
      }
    }
    this.db = this.client.db(this.dbName);
    this.collection = this.db.collection(this.collectionName);
  }

  async executeDbQuery(action, params, retries, retryConnection) {
    let res = null;
    try {
      await this.connection;
      res = await this.collection[action](...params);
    } catch (err) {
      //if retrying the connection don't count against number of retries
      //only retry connection once to make sure it isn't a connection issue
      if (retryConnection) {
        this.connection = this.createConnection(this.connectionRetryLimit, 0);
        res = this.executeDbQuery(action, params, retries, false);
      }
      //if connection already retried assume not a connection error and just retry query
      else if (retries-- > 0) {
        res = this.executeDbQuery(action, params, retries, false);
      } else {
        throw err;
      }
    }
    return res;
  }

  async deleteRecord(uuid) {
    const query = { uuid };
    const params = [query];
    let res = await this.executeDbQuery(
      "deleteOne",
      params,
      this.queryRetryLimit,
      true
    );
    let deleted = res.deletedCount;
    return deleted;
  }

  async replaceRecord(uuid, newRecord) {
    const query = { uuid };
    //only update value field
    const update = {
      $set: {
        value: newRecord,
      },
    };
    const params = [query, update];
    let res = await this.executeDbQuery(
      "updateOne",
      params,
      this.queryRetryLimit,
      true
    );
    let modified = res.modifiedCount;
    return modified;
  }

  async disconnect() {
    this.client.close();
  }
}

exports.DBManager = DBManager;
