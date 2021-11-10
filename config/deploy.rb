# config valid only for Capistrano 3.1
lock '3.2.1'

set :application, 'readify'
set :repo_url, 'git@bitbucket.org:gashawmola/readify.git'
set :branch, ENV["BRANCH"] || 'master'


# Default branch is :master
# ask :branch, proc { `git rev-parse --abbrev-ref HEAD`.chomp }.call

# Default deploy_to directory is /var/www/my_app
set :deploy_to, '/home/deploy/readify'

# Default value for :scm is :git
# set :scm, :git

# Default value for :format is :pretty
# set :format, :pretty

# Default value for :log_level is :debug
# set :log_level, :debug

# Default value for :pty is false
# set :pty, true

# Default value for :linked_files is []
# set :linked_files, %w{config/database.yml}

# Default value for linked_dirs is []
# set :linked_dirs, %w{bin log tmp/pids tmp/cache tmp/sockets vendor/bundle public/system}

# Default value for default_env is {}
# set :default_env, { path: "/opt/ruby/bin:$PATH" }

# Default value for keep_releases is 5
set :keep_releases, 3

set :rvm_map_bins, %w{gem rake ruby bundle rvmsudo}

set :bundle_flags, "--quiet"

set :bundle_binstubs, nil

set :bundle_path, nil

namespace :deploy do

  desc 'Start application'
  task :start do
    on roles(:app) do
      within release_path do
        execute "rvmsudo", "ENV=#{ fetch(:env) } god -c #{ current_path}/config/god/readify.rb"
      end
    end
  end

  desc 'Stop application'
  task :stop do
    on roles(:app) do
      within release_path do
        execute "rvmsudo", "god terminate"
      end
    end
  end

  desc 'Restart application'
  task :restart do
    on roles(:app), in: :sequence do
      within release_path do
        %w{ 8001 8002 }.each do |port|
          execute "rvmsudo", "god restart phantomjs-#{ port }"
        end
        execute "rvmsudo", "god restart nginx"
      end
    end
  end

  desc 'Hard Restart application'
  task :hard_restart do
    on roles(:app), in: :sequence do
      stop
      start
    end
  end

  desc 'Rewrite hosts file'
  task :rewrite_hosts_file do
    on roles(:app) do
      within release_path do
        execute "sudo", "cp hosts /etc/hosts"
      end
    end
  end

  after :publishing, :restart
  after :publishing, :rewrite_hosts_file

end
