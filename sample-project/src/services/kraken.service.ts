import axios from 'axios';


export const getCryptoRate = async(currency: any)=>{
    const baseUrl = 'https://api.kraken.com/0/public/Ticker?pair=';
    const url = `${baseUrl}${currency}USD`;
    const response = await axios.get(url);
    return response.data
}