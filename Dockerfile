# Use the official Nginx image as a lightweight base
FROM nginx:alpine

# Use a non-root user (good practice for security)
# The default nginx image runs as root unless configured otherwise
# To keep this simple and standard for static files, we'll stick to the base setup,
# but we ensure the files are copied correctly.

# Copy the static website files to the default Nginx public directory
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY links/ /usr/share/nginx/html/links/

# Expose port 80 to the outside world
EXPOSE 80

# The default command of the nginx image automatically starts the web server.
# No need to specify CMD or ENTRYPOINT explicitly.
