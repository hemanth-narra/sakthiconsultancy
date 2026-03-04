# Sakthi Consultancy Website

This project contains the static files for the Sakthi Consultancy dynamic web profile. Built entirely using Vanilla HTML, CSS, and JavaScript.

## 📂 Project Structure

- `index.html` - The main structure of the one-page scrollable website, featuring semantic sections that map to the company's services.
- `styles.css` - Custom styling handling responsive layouts (grid/flexbox), color theming based on the Sakthi brand (Navy Blue & Lime Green), and typography settings.
- `script.js` - Lightweight vanilla JS used to toggle the mobile menu and handle intersection-observer scroll animations for revealing content dynamically.
- `Dockerfile` - A simple Docker configuration utilizing `nginx:alpine` to serve this static content efficiently over HTTP.
- `Sakthi Consultancy Corporate Profile.pdf` / `extract_pdf.py` - Original reference materials and the script used to pull text and images for this web build.

## 🐳 Running with Docker

You can easily serve this website using Docker, which spins up a lightweight Nginx web server. 

### Prerequisites
Make sure you have [Docker](https://docs.docker.com/get-docker/) installed and running on your system.

### Steps to Run

1. **Open your terminal** and navigate to this project folder.
2. **Build the Docker Image:**
   This command packages your HTML, CSS, and JS into a ready-to-use server image.
   ```bash
   docker build -t sakthi-consultancy .
   ```
3. **Run the Docker Container:**
   This command starts the server and maps it to port `8080` on your machine.
   ```bash
   docker run -d -p 8080:80 --name sakthi-web sakthi-consultancy
   ```
4. **View the Website:**
   Open your web browser and navigate to:
   http://localhost:8080

### Stopping the Server
To stop the running website container:
```bash
docker stop sakthi-web
```
To remove the container completely:
```bash
docker rm sakthi-web
```

## 🛠️ Making Changes
Since these are static files, if you want to make changes to the text or styles, simply edit `index.html` or `styles.css`. 

**Note for Docker users:** If you change the code *while* the Docker container is running, the changes won't be reflected immediately. You must stop the container, re-run the `docker build ...` command to create a fresh image, and run it again. Alternatively, for local development, you can just open `index.html` directly in your browser or use a simple local server without Docker.
