import axios from 'axios';


export const getFiatRate = async(currency: any)=>{
    const baseUrl = 'https://open.er-api.com/v6/latest';
    const url = `${baseUrl}/${currency}`;
    const response = await axios.get(url);
    return response.data
}