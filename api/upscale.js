// api/upscale.js
// Vercel Serverless Function. Receives a base64 image from the frontend,
// sends it to Hugging Face's FREE Inference API for super-resolution
// (swin2SR model), and returns the result as a base64 data URL.
//
// Hugging Face's Inference API is free with no payment info ever
// required, but it runs on shared community hardware: the first
// request after a while can be slow (the model needs to "wake up"),
// and there's a rate limit on free accounts.
//
// Requires an environment variable HF_API_TOKEN set in your Vercel
// project settings (never put this key in the frontend code).

const MODEL_URL =
  'https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'لم يتم إرسال أي صورة' });
  }

  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HF_API_TOKEN غير مُعرّف في إعدادات السيرفر' });
  }

  try {
    const base64Data = image.split(',')[1];
    const mimeMatch = image.match(/^data:(.+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const buffer = Buffer.from(base64Data, 'base64');

    const response = await fetch(MODEL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': mimeType,
      },
      body: buffer,
    });

    // The free API can return a JSON error (e.g. "model is loading")
    // instead of an image while it's warming up.
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok || contentType.includes('application/json')) {
      const errData = await response.json().catch(() => ({}));
      if (errData.estimated_time) {
        return res.status(503).json({
          error: `الموديل بيشتغل لأول مرة، استنى حوالي ${Math.ceil(errData.estimated_time)} ثانية وجرّب تاني`,
        });
      }
      return res.status(response.status || 500).json({
        error: errData.error || 'فشلت عملية رفع الجودة، حاول مرة أخرى',
      });
    }

    const resultBuffer = Buffer.from(await response.arrayBuffer());
    const outputUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;

    return res.status(200).json({ outputUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
}
