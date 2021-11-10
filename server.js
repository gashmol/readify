var system    = require("system"),
    webserver = require("webserver"),
    webpage   = require("webpage");

var config     = require("./config.js"),
    readify = require('./readify'),
    redirectingUrls = require('./redirecting_urls'),
    rewriteUrls = require('./rewrite_urls'),
    benchmark = require('./benchmark');

var verbose = config.verbose;

var dbg = function(msg){
  if(verbose){
    console.log(msg);
  }
}

var configPage = function(page, send, timedOut){

  page.settings.userAgent = "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36";

  //disable gzip to overcome parsing bugs
  // page.customHeaders = {
  //   "Accept-Encoding": "identity"
  // };

  page.viewportSize = { width: 1920, height: 1080 }

  page.iframeUrls = [];

  page.onCallback = function(msg){
    switch(msg.action){
      case "runReadify":
        if(!timedOut.already && !page.stopping){
          page.injectJs('benchmark.js');
          var out = page.evaluate(readify);
          if(out && typeof out == "object"){
            send(200, JSON.stringify(out), true);
          } else {
            send(500, toHTML("no content"));
          }
          closePage(page);
        } else if(!page.stopping){
          closePage(page);
        }
    }
  }

  page.onResourceRequested = function(requestData, networkRequest){
    if(timedOut.already){
      return networkRequest.abort();
    }
    if(page.url != 'about:blank' && page.iframeUrls.indexOf(requestData.url) != -1){
      dbg("aborting: " + requestData.url.substring(0, 256));
      networkRequest.abort();
    } else {
      dbg("allowing: " + requestData.url.substring(0, 256));
    }
  }

  page.onConsoleMessage = function(msg) {
    if((/^(Readify|Benchmark)/).test(msg)){
      dbg('page: ' + msg);
    }
  };

  page.onNavigationRequested = function(url, type, willNavigate, main){
    var openNewPage = function(newUrl){
      dbg("navigating... : " + page.url + " > " + newUrl);
      closePage(page);
      openPageAndReadify(newUrl, send, timedOut);
    }
    dbg("nav req: " + page.url + " > " + url);
    if(!main){
      return page.iframeUrls.push(url);
    }
    var rewritedUrl = findRewriteUrl(url);

    if(rewritedUrl){
      openNewPage(rewritedUrl);
    } else if (page.url != 'about:blank' && page.url != "" && page.url != url){
      openNewPage(url);
    }
  }

  page.onError = function (msg, trace) {
    dbg("error catched! " + msg + " trace " + JSON.stringify(trace));
    setTimeout(function(){
      if(!page.stopping && !timedOut.already){
        page.onCallback({ action: "runReadify"});
      }
    }, 250);
  }
}

var openPageAndReadify = function(url, send, timedOut){
  if(!timedOut.already){
    var page = webpage.create();
    configPage(page, send, timedOut);
    var startedAt = new Date;
    page.open(url, function(status){
      if(!timedOut.already && !page.stopping){
        console.log("Benchmark - " + page.url + " open: " + ( (new Date).getTime() - startedAt.getTime() ) + "ms");
        if(!isUrlRedirecting(page.url)){
          page.evaluate(function(){
              var scrollInSteps = function(y, step, callback){
                if(y == window.scrollY){
                  return callback();
                } else if(y < window.scrollY){
                  step = -step;
                }
                if(Math.abs(window.scrollY - y) < Math.abs(step)){
                  window.scrollTo(0, y);
                  callback();
                } else {
                  window.scrollTo(0, window.scrollY + step);
                  setTimeout(function(){ scrollInSteps(y, step, callback) }, 5);
                }
              }
            scrollInSteps(document.body.clientHeight - window.innerHeight, 500, function(){
              window.scrollTo(0,0);
              window.callPhantom({ action: "runReadify" });
            });
          });
        }
      } else if(!page.stopping){
        closePage(page);
      }
    });
  }
}

var closePage = function(page){
  page.stopping = true;
  page.stop();
  page.close();
  page.onInitialized = page.onLoadFinished = page.onResourceRequested = page.onCallback = page.onConsoleMessage = page.onNavigationRequested = page.onError = null;
}

function onRequest(req, res) {
  var requestStartTime = new Date, timedOut = { already: false };

  var send = function(statusCode, data, isJson) {
    if(res){
      clearTimeout(timeout);
      res.statusCode = statusCode;
      if(isJson){
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
      }
      res.setHeader("Content-Length", byteLength(data));

      res.write(data);
      res.close();
      res = null;
      console.log("req: " + req.method + " " + req.url
                  + " status: " + statusCode 
                  + " time: " + ((new Date).getTime() - requestStartTime.getTime()) + "ms");
    }
  }

  if (req.method != "GET") {
    return send(405, toHTML("Method not accepted."));
  }

  var url = parse(req.url);

  var query = url.query,
      href  = query.href;

  var maxTime = config.maxTime;
  if(href && isUrlRedirecting(href)){
    maxTime = 1.5*maxTime;
  }
  var timeout = setTimeout(function(){
    if(!timedOut.already){
      timedOut.already = true;
      send(504, toHTML("page timeout"));
    }
  }, maxTime);

  if(url.pathname == "/test"){
    var testPage = webpage.create();
    testPage.open("https://www.google.com/", function(){
      if(testPage.evaluate(function(){ return true; })){
        send(200, toHTML("Test is OK"));
      } else {  
        send(500, toHTML("Test is not OK"));
      }
      return closePage(testPage);
    });
  } else if (url.pathname != "/") {
    return send(404, toHTML("Not found."));
  } else if (!href) {
    return send(400, toHTML("`href` parameter is missing."));
  } else {
    openPageAndReadify(href, send, timedOut);
  }

}

function isUrlRedirecting(url){
  var i, l, matching = false;
  for(i = 0, l = redirectingUrls.length; i < l; ++i){
    if(redirectingUrls[i].test(url)){
      matching = true;
      break;
    }
  }
  return matching;
}

function findRewriteUrl(url){
  var i, l, match = null, newUrl = null;
  for(i = 0, l = rewriteUrls.length; i < l; ++i){
    match = rewriteUrls[i].exec(url);
    if(match){
      newUrl = match[1];
      break;
    }
  }
  return newUrl;
}

function byteLength(str) {
  return encodeURIComponent(str).match(/%..|./g).length;
}

function toHTML(message) {
  return "<!DOCTYPE html><html><head><title>Readify</title></head><body>" + message + "</body></html>\n";
}

function parse(url) {
  var anchor = document.createElement("a");

  anchor.href = url;
  anchor.query = {};

  anchor.search.slice(1).split("&").forEach(function(pair) {
    pair = pair.split("=").map(decodeURIComponent);
    anchor.query[pair[0]] = pair[1];
  })

  return anchor;
}

if (!config.port) {
  console.error("No port specified in config.js");
  phantom.exit(1);
}

var server    = webserver.create();
var port = Number(system.env.PORT || system.args[1]) || config.port;
var listening = server.listen(port, onRequest);

if (!listening) {
  console.error("Could not bind to port " + port);
  phantom.exit(1);
}
console.log("Listening on port " + port);
