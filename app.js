const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config(); // Mengambil API key dari .env file
const textToSpeech = require('@google-cloud/text-to-speech');
const util = require('util');


const app = express();
const port = 2024;

// Middleware
const cors = require('cors');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define the whitelist for CORS
const whitelist = ['undefined','chrome-extension://eipdnjedkpcnlmmdfdkgfpljanehloah', 'https://eunice.eu.org'];
const corsOptions = {
  origin: function (origin, callback) {
    // Log the origin of the request
    console.log(`CORS request from origin: ${origin}`);
    
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      // If the origin is in the whitelist or is a local request, allow it
      console.log(`CORS request from ${origin} is allowed`);
      callback(null, true);
    } else {
      // If the origin is not in the whitelist, deny the request
      console.log(`CORS request from ${origin} is not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  }
};

// Apply CORS middleware with the whitelist
app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

// Path to the file that stores processed links
const processedFilesFile = path.join(__dirname, 'processedLinks.json');

// Setup directory for uploads
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// General function to load processed data from a common file
function loadProcessedData() {
  if (fs.existsSync(processedFilesFile)) {
    const data = fs.readFileSync(processedFilesFile);
    return JSON.parse(data);
  }
  return [];
}

// General function to save processed data to the common file
function saveProcessedData(data) {
  const processedData = loadProcessedData();
  processedData.push(data); // Add the new processed data
  fs.writeFileSync(processedFilesFile, JSON.stringify(processedData, null, 2));
}

// Setup Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Gunakan direktori yang sudah ditentukan untuk penyimpanan
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Gunakan nama asli file
  }
});

// Multer configuration for image upload
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('File type not allowed');
      error.status = 400;
      return cb(error, false);
    }
    cb(null, true);
  },
});
// Import Google Generative AI
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inisialisasi Google Generative AI dengan API key dari environment variables
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// API to upload an image or a PDF
app.post('/upload-image', upload.single('file'), async (req, res) => {
  try {
    // Check if a file was uploaded
    if (!req.file) {
      console.error('Error: No file uploaded.');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Load processed data (for both images and PDFs)
    const processedData = loadProcessedData();

    // Check if the image has already been processed
    const existingEntry = processedData.find(entry => entry.pdfLink === req.file.filename);
    if (existingEntry) {
      return res.status(200).json({
        message: 'This image has already been processed.',
        pdfLink: existingEntry.pdfLink,
        renamedFile: existingEntry.renamedFile,
        mp3File: existingEntry.mp3File,
        text: existingEntry.text
      });
    }

    // Log file details
    console.log(`File uploaded successfully: ${req.file.originalname}`);
    console.log(`File saved at: ${req.file.path}`);

    // [FEATURE ADDITION] - Process the image with Google Generative AI
    let imageDescription = '';
    try {
      // Baca file gambar yang di-upload
      const imageFile = await fs.promises.readFile(req.file.path);
      const imageBase64 = imageFile.toString('base64'); // Konversi ke base64

      // Gunakan Google Generative AI untuk mendeskripsikan gambar
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(["Halo, saya seorang disabilitas tuna netra yang membutuhkan bantuan memahami materi kuliah. Saya memiliki tangkapan layar dari materi tersebut. Dapatkah Anda membantu menjelaskan teks dalam gambar, termasuk judul, subjudul, poin penting, dan kesimpulan? Jika ada gambar, bagan, atau diagram, mohon berikan deskripsi yang jelas dan mendetail tentang apa yang ditampilkan, termasuk elemen-elemen di dalamnya, hubungan antar elemen, serta informasi penting lainnya yang perlu saya ketahui. Jika istilah atau konsepnya sulit, mohon sertakan penjelasan singkat untuk membantu saya memahami. Terakhir, tolong ringkas poin-poin utama dan ide penting dari materi berdasarkan gambar atau diagram yang sudah dijelaskan.",
        {
          inlineData: {
            data: imageBase64,
            mimeType: req.file.mimetype
          }
        }
      ]);

      // Mendapatkan deskripsi dari gambar
      const texte = result.response.text(); 
      imageDescription = cleanText(texte); // Membersihkan karakter khusus dari teks

      console.log(imageDescription);

      // [Set globalSourceId sebagai nama file gambar]
      globalSourceId = req.file.filename.replace(path.extname(req.file.filename), ''); // Menggunakan nama file tanpa ekstensi

    } catch (error) {
      console.error('Error during image description generation:', error);
      return res.status(500).json({ message: 'Terjadi kesalahan saat memproses gambar' });
    }

// [NEW FEATURE] - Convert the cleaned text (imageDescription) to MP3 using textToMp3
let mp3FilePath = '';
try {
  if (globalSourceId) {
    const mp3FileName = `${globalSourceId}.mp3`; // Menentukan nama file MP3 berdasarkan globalSourceId
    const mp3FilePathFull = await textToMp3(imageDescription); // Path lengkap hasil TTS (text to MP3)
    mp3FilePath = `/uploads/${mp3FileName}`; // Menyimpan path MP3 dalam format yang diinginkan
    console.log(`MP3 file generated at: ${mp3FilePathFull}`);
  } else {
    console.error('sourceId is not available for TTS conversion');
  }
} catch (error) {
  console.error('Error during text-to-speech conversion:', error);
  return res.status(500).json({ message: 'Terjadi kesalahan saat mengkonversi teks menjadi MP3' });
}


    // Save the processed image data
    const newEntry = {
      pdfLink: req.file.filename, // Nama file gambar
      renamedFile: "", // Kosong
      mp3File: mp3FilePath, // Path to the generated MP3 file
      text: imageDescription, // Deskripsi hasil dari Google Generative AI
      processedAt: new Date().toISOString() // Waktu proses
    };
    saveProcessedData(newEntry);

    // Respond with success message and file path
    return res.status(200).json({
      message: 'File uploaded successfully',
      pdfLink: newEntry.pdfLink,
      renamedFile: newEntry.renamedFile,
      mp3File: newEntry.mp3File, // Path to the generated MP3 file
      text: newEntry.text // Berisi deskripsi gambar dari Google Generative AI
    });
  } catch (error) {
    console.error(`Error during file upload: ${error.message}`);
    return res.status(500).json({ message: 'File upload failed', error: error.message });
  }
});


// Initialize the Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient();

// Global variable to store sourceId
let globalSourceId = null;

async function uploadToChatPDF(filePath) {
  try {
    const apiKey = process.env.CHATPDF_API_KEY;
    const uploadUrl = 'https://api.chatpdf.com/v1/sources/add-file';
    const messageUrl = 'https://api.chatpdf.com/v1/chats/message';

    // Read the file as a buffer
    const fileData = fs.readFileSync(filePath);

    // Upload the file to ChatPDF
    const uploadResponse = await axios({
      method: 'post',
      url: uploadUrl,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      data: fileData,
    });

    // Extract sourceId from the response
    globalSourceId = uploadResponse.data.sourceId;

    // Validate if sourceId exists
    if (!globalSourceId) {
      throw new Error('sourceId not found in ChatPDF response.');
    }

    console.log('File uploaded successfully. Source ID:', globalSourceId);

    // Rename the file to sourceId.pdf
    const newFilePath = path.join(uploadsDir, `${globalSourceId}.pdf`);
    fs.renameSync(filePath, newFilePath); // Rename file

    // Data for the message request
    const data = {
      sourceId: globalSourceId,
      messages: [
        {
          role: 'user',
          content: 'Halo, saya seorang tunanetra yang membutuhkan bantuan untuk memahami file ini. Dapatkah Anda membantu menjelaskan teks pada file ini, termasuk judul, subjudul, poin penting, dan kesimpulan? Jika terdapat gambar, bagan, atau diagram, mohon berikan deskripsi yang jelas dan mendetail tentang apa yang digambarkan, termasuk elemen-elemen yang ada, hubungan antar elemen, serta informasi penting lainnya yang perlu saya ketahui. Jika ada istilah atau konsep yang sulit, mohon sertakan penjelasan singkat untuk membantu saya memahami. Terakhir, tolong ringkas poin-poin utama dan ide penting dari materi berdasarkan gambar atau diagram yang sudah dijelaskan.',
        },
      ],
    };

    // Send a message to get the response
    const messageResponse = await axios.post(messageUrl, data, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Return the response text and new file path (renamed)
    return {
      summary: messageResponse.data,
      newFilePath: newFilePath, // return the renamed file path
    };
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Now, we can access globalSourceId in TTS function

async function textToMp3(text) {
  try {
    // Ensure globalSourceId is available
    if (!globalSourceId) {
      throw new Error('sourceId is not available');
    }

    // Set the text input to be synthesized
    const request = {
      input: { text: text },
      voice: { languageCode: 'id-ID', ssmlGender: 'NEUTRAL', name:'id-ID-Standard-C' }, // Select language and gender
      audioConfig: { audioEncoding: 'MP3' },
    };

    // Perform the text-to-speech request
    const [response] = await ttsClient.synthesizeSpeech(request);

    // Write the binary audio content to a local file
    const mp3FileName = `${globalSourceId}.mp3`; // Use globalSourceId for the filename
    const filePath = path.join(uploadsDir, mp3FileName);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(filePath, response.audioContent, 'binary');

    return filePath; // Return the file path of the MP3
  } catch (error) {
    console.error('Error converting text to speech:', error);
    throw new Error('Failed to convert text to MP3.');
  }
}


// Function to sanitize text by removing special characters
function cleanText(text) {
  // Remove special characters
  let cleanedText = text.replace(/[\*\#\@\$\%]/g, '')
                        .replace(/\n/g, ',')
                        .replace(/\//g, ' atau ')
                        .replace(/\n,\n,/g, ',\n');

  // Remove "Tentu," at the beginning of the sentence
  if (cleanedText.startsWith("Tentu,")) {
    cleanedText = cleanedText.replace(/^Tentu,/, '').trim();
  }

  return cleanedText;
}

// Function to download PDF from Google Drive
async function downloadPdfFromGoogleDrive(driveUrl) {
  try {
    console.log(`Starting download from Google Drive: ${driveUrl}`);
    
    // Extract the file ID from the Google Drive URL
    const fileId = extractGoogleDriveFileId(driveUrl);
    
    // If the file ID is not found, log an error
    if (!fileId) {
      console.error('Error: Invalid Google Drive URL. File ID could not be extracted.');
      throw new Error('Invalid Google Drive URL. File ID not found.');
    }

    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    console.log(`Downloading file from URL: ${url}`);

    // Download the file from Google Drive
    const response = await axios.get(url, { responseType: 'stream' });
    
    const filePath = path.join(uploadsDir, `${Date.now()}.pdf`);
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    // Return a promise that resolves when the download is finished
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Download successful! File saved at: ${filePath}`);
        resolve(filePath);
      });
      writer.on('error', (error) => {
        console.error(`Error during file download: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`Failed to download PDF from Google Drive: ${error.message}`);
    throw new Error(`Failed to download PDF from Google Drive: ${error.message}`);
  }
}

// Utility function to extract Google Drive file ID
function extractGoogleDriveFileId(driveUrl) {
  const match = driveUrl.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}
 

// API to handle PDF uploads, including Google Drive links and ChatPDF integration
// Modify the submit-pdf-link route to include TTS functionality
// Modified route for /submit-pdf-link
// Modified route for /submit-pdf-link
app.post('/submit-pdf-link', async (req, res) => {
  const { pdfLink } = req.body;

  if (!pdfLink) {
    return res.status(400).json({ message: 'pdfLink is required' });
  }

  // Load processed links and data
  const processedData = loadProcessedData();

  // Check if the link has already been processed
  const existingEntry = processedData.find(entry => entry.pdfLink === pdfLink);
  if (existingEntry) {
    // If the link was already processed, return the same response
    return res.status(200).json({
      message: 'This link has already been processed.',
      text: existingEntry.text,
      renamedFile: existingEntry.renamedFile,
      mp3File: existingEntry.mp3File,
      originalLink: existingEntry.pdfLink
    });
  }

  // Ensure the file is a PDF or a valid Google Drive link
  if (!pdfLink.endsWith('.pdf') && !pdfLink.includes('drive.google.com')) {
    return res.status(400).json({ message: 'File is not a PDF. Please upload a valid PDF file.' });
  }

  try {
    let filePath;

    // Handle Google Drive links
    if (pdfLink.includes('drive.google.com')) {
      filePath = await downloadPdfFromGoogleDrive(pdfLink);
    } else if (fs.existsSync(pdfLink)) {
      // Handle local PDF files
      filePath = path.join(uploadsDir, `${Date.now()}.pdf`);
      fs.copyFileSync(pdfLink, filePath);
    } else {
      return res.status(400).json({ message: 'Invalid PDF link or file not found.' });
    }

    // Upload the file to ChatPDF and get the summary, including new file path
    const chatPdfResponse = await uploadToChatPDF(filePath);

    // Ensure the summary and sourceId were obtained correctly
    if (!globalSourceId || !chatPdfResponse.summary) {
      throw new Error('Failed to obtain sourceId or summary from ChatPDF.');
    }

    // Clean the summary text by removing special characters
    const cleanedText = cleanText(chatPdfResponse.summary.content);

    // Generate an MP3 file from the cleaned text summary
    //const mp3FilePath = await textToMp3(cleanedText);

    const mp3FileName = `${globalSourceId}.mp3`; // Menentukan nama file MP3 berdasarkan globalSourceId
    const mp3FilePathFull = await textToMp3(cleanedText); // Path lengkap hasil TTS (text to MP3)
    mp3FilePath = `/uploads/${mp3FileName}`; // Menyimpan path MP3 dalam format yang diinginkan
    console.log(`MP3 file generated at: ${mp3FilePathFull}`);

    // Create an object to store all the processed data
    const processedData = {
      pdfLink: pdfLink,
      renamedFile: chatPdfResponse.newFilePath, // PDF file renamed
      mp3File: mp3FilePath, // Path to the generated MP3 file
      text: cleanedText, // Cleaned summary text
      processedAt: new Date().toISOString() // Timestamp of processing
    };

    // Save the processed data to the file
    saveProcessedData(processedData);

    // Send the response with the renamed file path, cleaned text summary, MP3 file path, and original link
    return res.status(200).json({
      message: 'PDF uploaded and processed successfully',
      text: cleanedText,
      renamedFile: chatPdfResponse.newFilePath, // PDF file renamed
      mp3File: mp3FilePath, // Path to the generated MP3 file
      originalLink: pdfLink // The original link provided by the user
    });
  } catch (error) {
    console.error(`Error handling PDF: ${error.message}`);
    return res.status(500).json({ message: `Error handling PDF: ${error.message}` });
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
