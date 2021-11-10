env   = ENV['ENV'] || 'development'
project_root  = ENV['ROOT'] || "/home/deploy/readify/current"

%w{ 8001 8002 }.each do |port|
  God.watch do |w|
    w.dir      = project_root
    w.name     = "phantomjs-#{ port }"
    w.start    = "phantomjs --ssl-protocol=any server.js"
    w.log      = "#{project_root}/log/phantomjs-#{ port }.std.log"
    w.env = { 'PORT' => "#{ port }" }
    w.interval = 5

    # determine the state on startup
    w.transition(:init, { true => :up, false => :start }) do |on|
      on.condition(:process_running) do |c|
        c.running = true
      end
    end

    # determine when process has finished starting
    w.transition([:start, :restart], :up) do |on|
      on.condition(:process_running) do |c|
        c.running = true
      end

      # failsafe
      on.condition(:tries) do |c|
        c.times = 5
        c.transition = :start
      end
    end

    # start if process is not running
    w.transition(:up, :start) do |on|
      on.condition(:process_exits)
    end

    # restart if memory or cpu is too high
    w.transition(:up, :restart) do |on|
      on.condition(:memory_usage) do |c|
        c.interval = 20
        c.above = 100.megabytes
        c.times = [3, 5]
      end

      on.condition(:cpu_usage) do |c|
        c.interval = 10
        c.above = 30.percent
        c.times = [3, 5]
      end

      on.condition(:http_response_code) do |c|
        c.interval = 30
        c.host = 'localhost'
        c.port = port
        c.path = '/test'  
        c.code_is_not = 200
        c.timeout = 10.seconds
        c.times = [2, 3]
      end
    end

  end
end

God.watch do |w|
  w.name = "nginx"
  w.interval = 30.seconds
  w.start = "sudo nginx -c #{ project_root }/config/nginx/#{ env }.conf"
  w.stop = "sudo nginx -s stop"
  w.restart = "sudo nginx -s reload"
  w.start_grace = 20.seconds
  w.pid_file = "/run/nginx.pid"
    
  w.behavior(:clean_pid_file)

  # determine the state on startup
  w.transition(:init, { true => :up, false => :start }) do |on|
    on.condition(:process_running) do |c|
      c.running = true
    end
  end

  # determine when process has finished starting
  w.transition([:start, :restart], :up) do |on|
    on.condition(:process_running) do |c|
      c.running = true
    end  
    
    # failsafe
    on.condition(:tries) do |c|
      c.times = 5
      c.transition = :start
    end
  end

  # start if process is not running
  w.transition(:up, :start) do |on|
    on.condition(:process_exits)
  end

end