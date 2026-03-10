@echo off
echo Building Next.js project...
call npm run build

echo Adding changes to Git...
git add .

echo Committing changes...
git commit -m "Deploy: %date% %time%"

echo Pushing to GitHub...
git push origin main

echo Deployment script finished.
pause