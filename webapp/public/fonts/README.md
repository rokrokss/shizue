# Fonts Directory

This directory should contain the Inter font files for Open Graph image generation:

- Inter-Regular.woff
- Inter-Bold.woff

You can download these fonts from:
https://fonts.google.com/specimen/Inter

Or use the following commands:

```bash
# Download Inter font files
curl -L "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" -o inter.zip
unzip inter.zip -d inter-temp
cp inter-temp/web/Inter-Regular.woff ./Inter-Regular.woff
cp inter-temp/web/Inter-Bold.woff ./Inter-Bold.woff
rm -rf inter-temp inter.zip
```
