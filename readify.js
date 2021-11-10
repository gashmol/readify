var readify = function (){

  var dbg = function(msg){
    console.log("Readify: " + msg);
  }

  var eToS = function(elem){
    return "" + elem.nodeName + ((elem.id && ("#" + elem.id)) || (elem.className && ("." + elem.className)));
  }

  var extract = function(){
    try {
      var i;

      window.scrollTo(0, 100);
      window.scrollTo(0, 0);

      var rating = rateContent();
      dbg("topCandidate: " + (rating.topCandidate && eToS(rating.topCandidate)));

      var topCandidate = rating.topCandidate,
          videos = rating.videos,
          goodImages = rating.goodImages;

      var articleContents = [], articleTitle = "", article = document.createElement("div");
      if(topCandidate){
        var sibling,
            siblingRect,
            topCandidateRect = topCandidate.getBoundingClientRect();
            topCandidateMaybeComment = nodeMaybeComment(topCandidate),
            topCandidateSiblings = Array.prototype.slice.call(topCandidate.parentNode.children);
        for(i = topCandidateSiblings.length - 1; i >= 0 ; --i){
          sibling = topCandidateSiblings[i];
          siblingRect = sibling.getBoundingClientRect();
          if(sibling === topCandidate || 
              (getAggragatedScore(sibling) >= 3 &&
              ((siblingRect.bottom <= topCandidateRect.top) || (siblingRect.top >= topCandidateRect.bottom)) &&
              (topCandidateMaybeComment ||(!topCandidateMaybeComment && !nodeMaybeComment(sibling))))){
            articleContents.unshift(sibling);
            (sibling != topCandidate) && dbg("Added sibling "+ eToS(sibling));
          }
        }
        var boundLookupRect = topCandidate.parentNode.getBoundingClientRect(), 
            curMediaRect, medias = videos.concat(goodImages), 
            badMedia = Array.prototype.slice.call(document.body.querySelectorAll("a img, a iframe, a embed")),
            curMedia = null,
            additionalMedia = null;
        for(i = medias.length - 1; i >= 0; --i){
          curMedia = medias[i];
          curMediaRect = curMedia.getBoundingClientRect();
          if((curMediaRect.bottom <= boundLookupRect.top) && (curMediaRect.width > 0.5 * boundLookupRect.width) &&
             ((curMediaRect.left >= boundLookupRect.left && curMediaRect.right <= boundLookupRect.right) ||
              (curMediaRect.left <= boundLookupRect.left && curMediaRect.right >= boundLookupRect.right)) &&
             badMedia.indexOf(curMedia) == -1 &&
             !topCandidate.parentNode.querySelector("[src='" + curMedia.getAttribute("src") + "']")){
            additionalMedia = medias[i];
            break;
          }
        }

        if(additionalMedia){
          articleContents.unshift(additionalMedia);
          dbg("additional media: " + eToS(additionalMedia));
        }

        articleTitle = extractTitle();

        // articleAuthor = extractAuthor();

        // articlePublishedAt = extractPublishedAt();

        removeNoneContent(articleContents, topCandidate);
        
        for(i = articleContents.length - 1; i >= 0; --i){
          cleanNode(articleContents[i]);
        }
      } else {
        articleTitle = extractTitle();
      }

      if(!videos.length){
        var ogVideo = getOgVideo();
        if(ogVideo){
          articleContents.unshift(ogVideo);
          dbg("og video: " + eToS(ogVideo));
        }
      }

      for(i = articleContents.length -1; i >=0; --i){
        article.insertBefore(articleContents[i],article.lastChild);
      }

      if(getWordCount(article.innerText) < 20 && !nodeHasGoodMedia(article)){
        var content = null;
      } else {
        content = killBrs(article.innerHTML);
      }

      return content && { title: articleTitle, content: content, url: location.href, isRTL: langIsRTL(topCandidate.innerText || "abc")};
    } catch (e){
      dbg("error: " + e + " line: " + e.line );
      return null;
    }
  }

  var rateContent = function(){
    var i;

    var nodesToScore = document.body.querySelectorAll("p, div, pre, section, article, blockquote, li, td, span, font, img, iframe, embed, "
                                                      + "em, strong, small, s, cite, q, dfn, abbv, data, time, code, var, samp, kbd, sub, sup, i, b, u, mark, ruby, rt, rp, bdi");
    var candidates = [];

    var curNode, parentNode, grandParentNode, score, tagName, goodImages = [], videos = [];
    for(i = nodesToScore.length - 1; i >= 0; --i ){
      
      curNode = nodesToScore[i];

      tagName = curNode.nodeName.toLowerCase();

      if(!nodeIsVisible(curNode)){
        continue;
      }

      if((tagName == "iframe" || tagName == "embed" ) && isVideoUrl(curNode.src)){
        curNode.isVideo = true;
        videos.push(curNode);
      } else if(tagName == "img" && isGoodImage(curNode)){
        curNode.isGoodImage = true;
        curNode.src = curNode.src;
        goodImages.push(curNode);
      }
      
      initNode(curNode);
      
      parentNode = curNode.parentNode;
      initNode(parentNode);

      grandParentNode = parentNode !== document.body ? parentNode.parentNode : null;
      if(grandParentNode){
        initNode(grandParentNode);
      }

      score = 0;

      if(nodeMaybeContent(curNode)){
        score += 10;
      }

      var curNodeRect = curNode.getBoundingClientRect();

      if(curNode.isVideo || curNode.isGoodImage){
        score += 10;
        if(curNodeRect.width && curNodeRect.height){
          curNode.dataset.ratio = curNodeRect.width / (curNodeRect.height);
          if(curNodeRect.width > 500 && curNodeRect.height >= 250){
            score += 10;
          } else if(curNodeRect.width > 700 && curNodeRect.height >= 350){
            score += 15;
          }
        }
      } else {
        score += getWordCount(getDirectInnerText(curNode));
      }

      if(nodeMaybeComment(curNode) || nodeMaybeNav(curNode) || nodeMaybeAd(curNode)){
        score *= 0.1;
      }

      curNode.readify.score += score/2;

      if(curNode.readify.score > 0){
        candidates.push(curNode);

        parentNode.readify.score += score;
        candidates.push(parentNode);

        if(grandParentNode){
          grandParentNode.readify.score += score/2;
          candidates.push(grandParentNode);
        }
      }

    }

    dbg(candidates.length + " candidates");

    var lookupLimitTop = 500, docHeight = document.body.clientHeight, curCandidate, topCandidate = null;
    do {
      if(lookupLimitTop > 2000 || lookupLimitTop >= docHeight){
        lookupLimitTop = null;
      }
      for(i = candidates.length - 1; i >= 0; --i){
        curCandidate = candidates[i];
        if(curCandidate.tagName == "A"){
          continue;
        }
        if(!topCandidate || (!nodeMaybeComment(curCandidate) && (curCandidate.readify.score > topCandidate.readify.score) && (!lookupLimitTop || (lookupLimitTop && (curCandidate.getBoundingClientRect().top < lookupLimitTop))) )){
          topCandidate = curCandidate;
          dbg("topCandidate: " + eToS(topCandidate) + " score: " + topCandidate.readify.score + " lookupLimitTop: " + lookupLimitTop);
        }
      }
      if(topCandidate  && (topCandidate.readify.score > 100 || (lookupLimitTop >= 2000 && topCandidate.readify.score > 50 ))){
        break;
      } else if(lookupLimitTop){
        lookupLimitTop += 500;
      }
    } while(lookupLimitTop);
    
    if(topCandidate){
      topCandidate.isTopCandidate = true;
    }

    return { topCandidate: topCandidate, videos: videos, goodImages: goodImages }
  }

  var extractTitle = function(){
    var title = "", 
        titleWordCount = 0,
        candidateType,
        candidates = [
          document.getElementsByTagName("h1"),
          document.getElementsByTagName("h2"),
          document.querySelectorAll("[id='title']"),
          document.querySelectorAll("[class='title']")
          ],
        docTitle = document.title,
        docTitleWordCount = getWordCount(docTitle);
    for(var i = 0, len = candidates.length; i < len; ++i){
      candidateType = candidates[i];
      title = (candidateType && candidateType.length == 1 && candidateType[0].innerText) || "";
      titleWordCount = getWordCount(title);
      if(title && titleWordCount >= 3){
        return title;
      }
    }
    return docTitle;
  }

  var removeNoneContent = function(articleContents, topCandidate){
    var i, noneContent = [];
    for(i = articleContents.length -1; i >= 0; --i ){
      grabNoneContent(articleContents[i], noneContent);
    }

    var toRemoveNode, contentIndex;
    for(i = noneContent.length - 1; i >= 0; --i){
      toRemoveNode = noneContent[i];
      if(toRemoveNode.parentNode){
        toRemoveNode.parentNode.removeChild(toRemoveNode);
      }
      contentIndex = articleContents.indexOf(toRemoveNode);
      if(contentIndex != -1){
        articleContents.splice(contentIndex, 1);
      }
    }
  }

  // TODO: simplfy node structure.
  var cleanNode = function(node){
    var children = Array.prototype.slice.call(node.children || []);
    for(var i = children.length - 1; i >= 0; --i){
      cleanNode(children[i]);
    }
    if(!(node.isGoodImage || node.isVideo) && node.childElementCount == 0 && node.innerText.trim() == "" && node.nodeName.toLowerCase() != "br" && node.nodeName.toLowerCase() != "td"){
      node.parentNode && node.parentNode.removeChild(node);
    } else {
      node.removeAttribute('style');
      if(node.tagName.toLowerCase() == "font"){
        node.outerHTML = node.innerHTML;
      } else if(node.src){
        node.setAttribute("src", node.src);
      }
    }
  }

  var grabNoneContent = function(node, noneContentList){
    var nodeStyle, tagName = node.nodeName.toLowerCase();
    if(!node.isTopCandidate){
      switch(tagName){
        case "br":
          return;
        case "style":
        case "script":
        case "link":
        case "noscript":
        case "template":
        case "nav":
        case "h1":
        case "hr":
        case "form":
        case "fieldset":
        case "legend":
        case "label":
        case "input":
        case "button":
        case "select":
        case "datalist":
        case "optgroup":
        case "option":
        case "textarea":
        case "keygen":
        case "output":
        case "progress":
        case "meter":
        case "details":
        case "summary":
        case "menuitem":
        case "menu":
        case "canvas":
        case "map":
        case "area":
        case "wbr":
        case "object":
        case "param":
        case "video":
        case "audio":
        case "source":
        case "track":
        case "svg":
        case "math":
          return markNoneContent(node, noneContentList, "none content element");
        case "img":
        case "iframe":
        case "embed":
          if(node.isGoodImage || node.isVideo){
            return;
          } else {
            return markNoneContent(node, noneContentList, "bad img/iframe/embed");
          }
        case "table":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
        case "em":
        case "strong":
        case "small":
        case "s":
        case "cite":
        case "q":
        case "dfn":
        case "abbv":
        case "data":
        case "time":
        case "code":
        case "var":
        case "samp":
        case "kbd":
        case "sub":
        case "sup":
        case "i":
        case "b":
        case "u":
        case "mark":
        case "ruby":
        case "rt":
        case "rp":
        case "bdi":
        case "figure":
        case "figcaption":
          if(nodeIsVisible(node)){
           break;
          } else {
           return markNoneContent(node, noneContentList, "invisible inline element");
          }
        case "a":
          if((nodeIsVisible(node) && node.getAttribute("href") && node.getAttribute("href").indexOf("#") != 0) || nodeHasGoodMedia(node)){
            break;
          } else {
            return markNoneContent(node, noneContentList, "invisible link or src=#");
          }
        case "td":
        case "th":
        case "tr":
        case "tbody":
        case "thead":
        case "tfoot":
        case "caption":
        case "colgroup":
        case "col":
        case "li":
          break;
        default:
          if(!nodeIsVisible(node)){
            return markNoneContent(node, noneContentList, "invisible element");
          } else {
            
            if(nodeMaybeAd(node) || nodeMaybeNav(node)){
              if(getLinkDensity(node) > 0.333333 || node.querySelectorAll("a img, iframe, embed").length > 0){
                return markNoneContent(node, noneContentList, "(ad|nav)");
              }
            }
            
            if(nodeMaybeComment(node)){
              return markNoneContent(node, noneContentList, "element might be a comment");//later check for template patterns.
            }

            if(nodeMaybeAuthorDetail(node)){
              if(getWordCount(node.innerText) < 30){
                return markNoneContent(node, noneContentList, "element is author details");
              }
            }

            if(nodeMaybePubDate(node)){
              if(getWordCount(node.innerText) < 20){
                return markNoneContent(node, noneContentList, "element is pubDate");
              }
            }

            if(nodeMaybeShareTools(node)){
              if(getWordCount(node.innerText) < 30 && /\d+/.test(node.innerText)){
                return markNoneContent(node, noneContentList, "element is share tools");
              }
            }
            
            nodeStyle = window.getComputedStyle(node);

            if(getWordCount(node.innerText) < 40 && !nodeHasGoodMedia(node)){
              if(isFontSizeSmaller(node)){
                return markNoneContent(node, noneContentList, "element font size is smaller");
              } else if(nodeStyle.getPropertyValue("position") != "static"){
                return markNoneContent(node, noneContentList, "element is positioned");
              } else if(nodeStyle.getPropertyValue("float") != "none"){
                return markNoneContent(node, noneContentList, "element is floating");
              } else if(node.querySelectorAll("img, iframe, embed, object").length > 0 
                        && node.getElementsByTagName("a").length > 0){
                return markNoneContent(node, noneContentList, "element has link & bad media");
              }
            }
            if(!nodeHasGoodMedia(node) && getLinkDensity(node) > 0.90){
              return markNoneContent(node, noneContentList, "element with too much links")
            }
            if(!getAggragatedScore(node)){
              return markNoneContent(node, noneContentList, "element without content");
            }
          }
      }
    }

    var children = node.children || [];
    for( var i = children.length - 1; i >= 0; --i){
      grabNoneContent(children[i], noneContentList);
    }
  }

  var initNode = function(node){
    if(!node.readify){
      node.readify = { score: 0, wordCount: 0, linkDensity: 0 };
    }
  }

  var getDirectInnerText = function(node){
    var i, l, curChildNode, text = "";
    for(curChildNode = node.firstChild; !!curChildNode; curChildNode = curChildNode.nextSibling){
      if(curChildNode.nodeType == Node.TEXT_NODE){
        text += curChildNode.nodeValue;
      }
    }
    return text;
  }

  var getWordCount = function(str){
    var matches = str.match(/\S+/g);
    return matches && matches.length || 0;
  }

  var getLinkDensity = function(node){
    var links = node.getElementsByTagName("a");
    var linkWordCount = 0;
    for(i = links.length - 1; i >= 0 ; --i){
      linkWordCount += getWordCount(links[i].innerText);
    }
    var textWordCount = getWordCount(node.innerText) - linkWordCount;
    if(textWordCount == 0){
      return linkWordCount > 0 ? 1 : 0;
    } else {
      return linkWordCount / textWordCount;
    }
  }

  var nodeIsVisible = function(node){
    var style = getComputedStyle(node);
    var rect = node.getBoundingClientRect(node);
    var parentNode = node.parentNode;
    if(parentNode == document.body){
      parentNode = null;
    }
    return  style.getPropertyValue("display").toLowerCase() != 'none' &&
            style.getPropertyValue("visibility").toLowerCase() != 'hidden' &&
            ((node.childNodes.length > 0 && style.getPropertyValue("overflow") != "hidden") || (rect.width > 1 && rect.height > 1)) &&
            (!parentNode || (parentNode && nodeIsVisible(parentNode)));
  }

  var getAggragatedScore = function(node){
    var score = 0, children = node.children || [];
    if(children.length){
      for(var i = children.length - 1; i >= 0; --i){
        score += getAggragatedScore(children[i]);
      }
    } 
    score += (node.readify && node.readify.score) || 0;
    return score;
  }

  var nodeMaybeComment = function(node){
    return /(comment|talkback|reply|replies|discuss)/i.test(node.className + node.id);
  }

  var nodeMaybeAd = function(node){
    return /([ _-]ad[ _-]|adsense|promo|sponsor)/i.test(node.className +" "+ node.id);
  }

  var nodeMaybeNav = function(node){
    return /(related|similar|tags|sidebar|outbrain|recommend|tools|navbar)/i.test(node.className + " " + node.id);
  }

  var nodeMaybeShareTools = function(node){
    return /(share|social|tools|widget)/i.test(node.className + " " + node.id);
  }

  var nodeMaybeAuthorDetail = function(node){
    return node.getAttribute("itemprop") == "author" || /(author|by.?line)/i.test(node.className + " " + node.id);
  }

  var nodeMaybePubDate = function(node){
    return node.getAttribute("itemprop") == "datePublished" || node.getAttribute("itemprop") == "dateCreated" || node.getAttribute("itemprop") == "dateModified"
           || /(pubdate|pubtime|published.?date|published.?time|posted.?date|posted.?time|date.?published|time.?published|tmstmp|timestamp)/i.test(node.className + " " + node.id);
  }

  var nodeMaybeContent = function(node){
    return node.getAttribute("itemprop") == "articleBody";
  }

  var videosRegex = [
    /^(?:https?:\/\/|\/\/)(?:www\.)?youtube\.com\/watch\?v=([^\&\?\/]+)/,
    /^(?:https?:\/\/|\/\/)(?:www\.)?youtube\.com\/embed\/([^\&\?\/]+)/,
    /^(?:https?:\/\/|\/\/)(?:www\.)?youtube\.com\/v\/([^\&\?\/]+)/,
    /^(?:https?:\/\/|\/\/)youtu\.be\/([^\&\?\/]+)/,
    /^(?:https?:\/\/|\/\/)(?:www\.)?rutube\.ru\/video\/(\w+)/,
    /^(?:https?:\/\/|\/\/)(?:www\.)?rutube\.ru\/play\/embed\/(\w+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?dailymotion.com\/video\/([\w-]+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?dailymotion.com\/embed\/video\/([\w-]+)/, 
    /^(?:https?:\/\/|\/\/)dai.ly\/([\w-]+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?metacafe.com\/watch\/([\w-]+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?metacafe.com\/fplayer\/(\w+)\/metacafe.swf/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?metacafe.com\/embed\/([\w-]+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?vine\.co\/v\/(\w+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?vine\.co\/v\/(\w+)\/embed/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?instagram\.com\/p\/([\w\-]+)/, 
    /^(?:https?:\/\/|\/\/)(?:www\.)?instagram\.com\/p\/([\w\-]+)\/embed/
  ];

  var isVideoUrl = function(url){
    var match = false;
    for(var i = videosRegex.length - 1; i >=0; --i ){
      if(videosRegex[i].test(url)){
        match = true;
        break;
      }
    }
    return match;
  }

  var getVideoID = function(url){
    var matches = null;
    for(var i = videosRegex.length - 1; i >=0; --i ){
      if(matches = videosRegex[i].exec(url)){
        return matches[1];
      }
    }
  }

  var getNormalizedUrl = function(url, id){
    if(url.indexOf("youtu") != -1){
      return "http://www.youtube.com/embed/" + id;
    }
    return url;
  }

  var isGoodImage = function(img){
    var minRatio = 1/9, maxRatio = 3;
    var width = img.width;
    var height = img.height;
    if(img.src && width > 200 && height > 100){
      var curRatio = width / height;
      if(curRatio > minRatio && curRatio < maxRatio){
        return true;
      }
    }
    return false;
  }

  var getOgVideo = function(){
    var ogVideoMeta = document.querySelector('[property="og:video"]'), videoID;
    if(ogVideoMeta && (videoID = getVideoID(ogVideoMeta.getAttribute("content")))){
      var video = document.createElement("iframe");
      video.isVideo = true;
      video.src = getNormalizedUrl(ogVideoMeta.getAttribute("content"), videoID);
      var width = document.querySelector('[property="og:video:width"]');
      width = width && parseFloat(width.getAttribute("content"));
      var height = document.querySelector('[property="og:height"]');
      height = height && parseFloat(height.getAttribute("content"));
      video.dataset.ratio = (width && height && width/height) || null;
      return video;
    }
  }

  var nodeHasGoodMedia = function(node){
    var videos = node.querySelectorAll('iframe, embed'), images = node.getElementsByTagName('img');
    for(var i = videos.length - 1; i >=0; --i){
      if(videos[i].isVideo){
        return true;
      }
    }
    for(i = images.length - 1; i>= 0; --i){
      if(images[i].isGoodImage){
        return true;
      }
    }
    return false;
  }

  var compEnv = function(node, predicate){
    var previous = node.previousElementSibling,
        prevPrevious = previous && previous.previousElementSibling,
        next = node.nextElementSibling,
        nextNext = next && next.nextElementSibling;
    if(previous && next){
      return predicate(node, previous, next);
    } else if(previous && prevPrevious){
      return predicate(node, previous, prevPrevious);
    } else if(next && nextNext){
      return predicate(node, next, nextNext);
    } else {
      return predicate(node, previous, next);
    }
  }

  var isFontSizeSmaller = function(node){
    return compEnv(node, function(n, a, b){
      if(a && b){
        var nFontSize = parseFloat(getComputedStyle(n).getPropertyValue("font-size"));
        var aFontSize = parseFloat(getComputedStyle(a).getPropertyValue("font-size"));
        var bFontSize = parseFloat(getComputedStyle(b).getPropertyValue("font-size"));
        return nFontSize < aFontSize && nFontSize < bFontSize;
      } else {
        return false;
      }
    });
  }

  var markNoneContent = function(node, noneContentList, reason){
    dbg("none content: " + eToS(node) + " reason: " + reason);
    noneContentList.push(node);
  };

  var langIsRTL = function(sampleText) {
    var t = sampleText.replace(/@\w+/, ''),
        countHeb = countMatches('[\\u05B0-\\u05F4\\uFB1D-\\uFBF4]'),
        countArb = countMatches('[\\u060C-\\u06FE\\uFB50-\\uFEFC]');

    function countMatches (match) {
        var matches = t.match(new RegExp(match, 'g'));
        return matches !== null ? matches.length : 0;
    }

    return (countHeb + countArb) * 100 / t.length > 20;
  }

  var removeNode = function(node){
    var parentNode = node.parentNode;
    if(parentNode){
      parentNode.removeChild(node);
    }
  }

  var killBrs = function(html){
    return html.replace(/(<br\s*\/?>(\s|&nbsp;?)*){1,}/g, "<br />");
  }

  extract = benchmark("extract", extract);
  
  return extract();

}

module.exports = readify;
