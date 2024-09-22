# Menggunakan image Node.js versi LTS sebagai base image
FROM node:18

# Mengatur working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json ke container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh kode aplikasi ke dalam container
COPY . .

# Expose port yang digunakan oleh aplikasi
EXPOSE 3000

# Perintah untuk menjalankan aplikasi
CMD ["npm", "start"]
