var benchmark = function(name, action){
  return function(){
    var args = Array.prototype.slice.call(arguments, 0),
        startedAt = new Date;
    var val = action.apply(this, args);
    console.log("Benchmark - " + name + ": " + ( (new Date).getTime() - startedAt.getTime() ) + "ms");
    return val;
  }
};

(typeof module != 'undefined') && module.exports && (module.exports = benchmark);