// api/upscale.js
// Vercel Serverless Function. Receives a base64 image from the frontend,
// sends it to Replicate's Real-ESRGAN model for upscaling, waits for the
// result, and returns the output image URL.
//
// Requires an environment variable REPLICATE_API_TOKEN set in your
// Vercel project settings (never put this key in the frontend code).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, scale } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'لم يتم إرسال أي صورة' });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN غير مُعرّف في إعدادات السيرفر' });
  }

  try {
    // 1. Start the prediction (Real-ESRGAN model on Replicate)
    const createResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Real-ESRGAN version hash (check Replicate's model page for the
        // latest version id if this becomes outdated)
        version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46a',
        input: {
          image: image,
          scale: Number(scale) || 4,
          face_enhance: false,
        },
      }),
    });

    const prediction = await createResp.json();

    if (!createResp.ok) {
      return res.status(createResp.status).json({ error: prediction.detail || 'فشل بدء المعالجة' });
    }

    // 2. Poll until the prediction finishes (Replicate processes async)
    let result = prediction;
    const maxAttempts = 60; // ~60s * 2 = up to 2 minutes
    let attempts = 0;

    while (
      result.status !== 'succeeded' &&
      result.status !== 'failed' &&
      result.status !== 'canceled' &&
      attempts < maxAttempts
    ) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollResp = await fetch(
        `https://api.replicate.com/v1/predictions/${result.id}`,
        { headers: { 'Authorization': `Token ${token}` } }
      );
      result = await pollResp.json();
      attempts++;
    }

    if (result.status !== 'succeeded') {
      return res.status(500).json({ error: 'فشلت عملية رفع الجودة، حاول مرة أخرى' });
    }

    return res.status(200).json({ outputUrl: result.output });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
}
