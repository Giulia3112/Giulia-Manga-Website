// ═══════════════════════════════════════════════════
//  Firebase Configuration — G.A. Website
// ═══════════════════════════════════════════════════
//
//  COMO CONFIGURAR:
//  1. Acesse console.firebase.google.com
//  2. Crie um projeto (ou use um existente)
//  3. Vá em "Configurações do projeto" > "Seus apps" > Ícone </> (Web)
//  4. Registre o app e copie o objeto firebaseConfig abaixo
//  5. Habilite Firestore: Build > Firestore Database > Create database
//  6. Habilite Storage: Build > Storage > Get started
//  7. Habilite Auth: Build > Authentication > Sign-in method > Email/Password
//  8. Adicione o usuário admin: Authentication > Users > Add user
//     Email: alvaresgiulia@gmail.com | Senha: (a que você quiser)
//  9. Configure as regras do Firestore (Firestore > Rules):
//
//     rules_version = '2';
//     service cloud.firestore {
//       match /databases/{database}/documents {
//         match /site/{doc} {
//           allow read: if true;
//           allow write: if request.auth != null;
//         }
//       }
//     }
//
//  10. Configure as regras do Storage (Storage > Rules):
//
//      rules_version = '2';
//      service firebase.storage {
//        match /b/{bucket}/o {
//          match /{allPaths=**} {
//            allow read: if true;
//            allow write: if request.auth != null;
//          }
//        }
//      }
//
// ═══════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "AIzaSyD0HB0zjw-9WUFvTsN1de6Nw4n-DYQSJwA",
  authDomain:        "giulia-manga-website.firebaseapp.com",
  projectId:         "giulia-manga-website",
  storageBucket:     "giulia-manga-website.firebasestorage.app",
  messagingSenderId: "820466141949",
  appId:             "1:820466141949:web:fe0951dcc21562827ccc94",
  measurementId:     "G-7B1R0MDHVZ"
};
