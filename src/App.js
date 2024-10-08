import { useState } from 'react';
import './App.css';
const uuid = require('uuid');

function App() {
  const [image, setImage] = useState('');
  const [uploadResultMessage, setUploadResultMessage] = useState('Please upload an image to authenticate.');
  const [visitorName, setVisitorName] = useState('placeholder.jpg');
  const [isAuth, setIsAuth] = useState(false);

  function sendImage(e) {
    e.preventDefault();
    setVisitorName(image.name);
    const visitorImageName = uuid.v4();
    fetch(`https://946xwh2dgc.execute-api.us-east-2.amazonaws.com/dev/facial-recog-visitor-images/${visitorImageName}.jpg`,{
      method:'PUT',
      headers:{
        'Content-Type':'image/jpg'
      },
      body:image
    }).then(async()=>{
      const response = await authenticate(visitorImageName);
      if(response.Message === 'Success'){
        setIsAuth(true);
        setUploadResultMessage(`Hi ${response[firstName]} ${response[lastName]}, Welcome to work!`)
      }else{
        setIsAuth(false);
        setUploadResultMessage(`Authentication Failed. This person is not an employee`)
      }
    }).catch(error => {
      setIsAuth(false);
      setUploadResultMessage(`Error during authentication process. Please try again.`)
      console.error(error); 
    })
  }

  async function authenticate(visitorImageName) {
    const requestUrl = 'https://946xwh2dgc.execute-api.us-east-2.amazonaws.com/dev/employee?' + new URLSearchParams({
      objectKey: `${visitorImageName}.jpg`
    });
    return await fetch(requestUrl,{
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    }).then(response => response.json())
    .then((data) => {
      return data;
    }).catch(error => console.error(error));
  }

  return (
    <div className="App">
      <h2>Facial Recognition System</h2>
      <form onSubmit={sendImage}>
        <input type='file' name='image' onChange={e => setImage(e.target.files[0])}></input>
          <button type='Submit'>Authenticate</button>
      </form>
      <div className={isAuth ? 'success' : 'failure'}>{uploadResultMessage}</div>
      <img src={require(`./visitors/${visitorName}`)} alt="Visitor" height={250} width={250}></img>
    </div>
  );
}

export default App;
