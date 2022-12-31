import cors from 'cors';
import {adminRouter} from "./controllers/adminController";
import {featuresRouter} from "./controllers/featuresController";
import {streamEventsRouter} from "./controllers/streamEventsController";
import proxyMiddleware from "./middleware/proxyMiddleware";
import init from "./init";

const { app } = init();

app.use(cors());

app.use('/admin', adminRouter);
app.use('/sub', streamEventsRouter);
app.use('/', featuresRouter);

// proxy anything else through to GrowthBook
app.all('/*', proxyMiddleware);