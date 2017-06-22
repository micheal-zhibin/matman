const express = require('express');
const methodOverride = require('method-override');
const _ = require('lodash');
const request = require('request');
const bodyParser = require('../body-parser');
const business = require('../business');

module.exports = (entryPath) => {
  const entry = require(entryPath);

  let mockerList = business.getMockerList(entry.MOCKER_PATH);

  // Create router
  // http://expressjs.com/en/4x/api.html#router
  const router = express.Router();

  // Add middlewares
  router.use(methodOverride());
  router.use(bodyParser);

  // Expose render
  router.render = (req, res) => {
    res.jsonp(res.locals.data)
  };

  // GET /sys-cgi/mocker 所有的 mocker 列表信息
  router.get('/sys-cgi/mocker', (req, res) => {
    mockerList = business.getMockerList(entry.MOCKER_PATH);

    res.jsonp(mockerList);
  });

  // GET /sys-cgi/mocker/:mockerName 获得这个 mocker 的信息
  router.get('/sys-cgi/mocker/:mockerName', (req, res) => {
    let result = business.getMocker(entry.MOCKER_PATH, req.params.mockerName);

    res.jsonp(result);
  });

  // POST /sys-cgi/mocker/:mockerName 设置这个mocker的信息
  router.post('/sys-cgi/mocker/:mockerName', (req, res) => {
    let result = business.setActiveModule(entry.MOCKER_PATH, req.params.mockerName, req.body.activeModule);

    res.jsonp(result);
  });

  router.all('*', function (req, res, next) {
    next();
  });

  // 根据用户配置的路由关系，进行解析
  // console.log('mockerList', mockerList);
  mockerList.forEach((mockerData) => {
    //TODO cgi 可能不是以 / 开头的，建议以 route 形式会更好

    // 默认是 get 请求，除非定义 method 字段
    const METHOD = (mockerData.method || 'get').toLowerCase();
    const ROUTE_PATH = mockerData.route;

    // http://expressjs.com/en/4x/api.html#router.METHOD
    router[METHOD](ROUTE_PATH, function (req, res) {
      // Express的req对象，详见 http://expressjs.com/en/4x/api.html#req

      // post 请求
      // mockerData.route="/cgi-bin/a/b/post_cgi"
      // post http://localhost:3000/cgi-bin/a/b/post_cgi data={activeModule:"error_not_login"}
      // req.baseUrl=""
      // req.originalUrl="/cgi-bin/a/b/post_cgi"
      // req.url="/cgi-bin/a/b/post_cgi"
      // req.method="POST"
      // req.OriginalMethod="POST"
      // req.body.activeModule = "error_not_login"
      // req.body = data

      // get 请求
      // mockerData.route="/cgi-bin/a/b/simple_cgi"
      // get http://localhost:3000/cgi-bin/a/b/simple_cgi?activeModule=error_not_login
      // req.baseUrl=""
      // req.originalUrl="/cgi-bin/a/b/simple_cgi?activeModule=error_not_login"
      // req.url="/cgi-bin/a/b/simple_cgi?activeModule=error_not_login"
      // req.method="GET"
      // req.OriginalMethod="GET"
      // req.query.activeModule = "error_not_login"

      // get 请求且route为匹配类型
      // mockerData.route="/cgi-bin/a/b/id/:id"
      // get http://localhost:3000/cgi-bin/a/b/id/1?activeModule=error_not_login
      // req.baseUrl=""
      // req.originalUrl="/cgi-bin/a/b/id/1?activeModule=error_not_login"
      // req.url="/cgi-bin/a/b/id/1?activeModule=error_not_login"
      // req.method="GET"
      // req.OriginalMethod="GET"
      // req.query.activeModule = "error_not_login"
      // req.params.id = "1"

      let mockerBasePath = entry.MOCKER_PATH;
      let url = ROUTE_PATH;
      let params = (METHOD === 'post') ? req.body : req.query;

      // 还要合并一下来自 url path 中的参数值
      params = _.merge({}, params, req.params);

      // 请求
      business.getMockModule(mockerBasePath, url, params, req)
        .then((result) => {
          res.jsonp(result);
        })
        .catch((err) => {
          // 注意 err 有可能是 Error 对象，也可能是普通的字符串或对象
          let errMsg = err.stack || err;

          console.error(errMsg);

          res.status(500).send(errMsg);
        });
    });
  });

  router.use((req, res) => {
    // get 请求
    // get http://localhost:3000/cgi-bin/a/b/not_exist_cgi?activeModule=error_not_login
    // req.headers.host="localhost:3000"
    // req.params[0]="/cgi-bin/a/b/not_exist_cgi"
    // req.baseUrl=""
    // req.originalUrl="/cgi-bin/a/b/not_exist_cgi?activeModule=error_not_login"
    // req.url="/cgi-bin/a/b/not_exist_cgi?activeModule=error_not_login"
    // req.method="GET"
    // req.OriginalMethod="GET"
    // req.query.activeModule = "error_not_login"

    // post 请求
    // post http://localhost:3000/cgi-bin/a/b/not_exist_cgi data={activeModule:"error_not_login"}
    // req.params[0]="/cgi-bin/a/b/not_exist_cgi"
    // req.baseUrl=""
    // req.originalUrl="/cgi-bin/a/b/not_exist_cgi"
    // req.url="/cgi-bin/a/b/not_exist_cgi"
    // req.method="POST"
    // req.OriginalMethod="POST"
    // req.body.activeModule = "error_not_login"

    // 未匹配到的请求将会来到这里
    console.log('[use]', req.url, req.query._m_ignore);

    const opts = {
      url: 'http://' + req.headers.host + req.url,
      headers: req.headers,
      jar: true
    };

    if (req.method === 'GET') {
      request
        .get(_.merge({}, opts))
        .pipe(res);
    } else if (req.method === 'POST') {
      request
        .post(_.merge({}, opts, {
          form: req.body
        }))
        .pipe(res);
    } else {
      if (!res.locals.data) {
        res.status(404);
        res.locals.data = {};
      }

      router.render(req, res);
    }

  });

  router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(err.stack);
  });

  return router;
};
